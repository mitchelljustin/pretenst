/*
 * Copyright (c) 2019. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import { Evolution } from "../gotchi/evolution"
import { Jockey } from "../gotchi/jockey"
import { fetchGenome, fetchJourney, Hexalot } from "../island/hexalot"
import { Island } from "../island/island"
import {
    calculateHexalotId,
    IIslandData,
    isIslandLegal,
    isSpotLegal,
    recalculateIsland,
    Surface,
} from "../island/island-logic"
import { Journey } from "../island/journey"
import { Spot } from "../island/spot"
import {
    EvolutionTarget,
    HexalotTarget,
    IFlightState,
    JockeyTarget,
    WithHexalot,
    WithSpot,
} from "../view/flight-state"

import { AppMode, IAppState } from "./app-state"

export class Transition {
    private nextState: IAppState

    constructor(prev: IAppState) {
        this.nextState = {...prev, nonce: prev.nonce + 1}
    }

    public get appState(): IAppState {
        return this.nextState
    }

    public async withIsland(island: Island, islandData: IIslandData): Promise<Transition> {
        const withNoneSelected = await this.withSelectedSpot()
        withNoneSelected.withJourney().withoutEvolution.nextState = {...this.nextState, island, islandData}
        return this
    }

    public withFlightState(flightState: IFlightState): Transition {
        this.nextState = {...this.nextState, flightState}
        return this
    }

    public get terraforming(): Transition {
        this.nextState = {...this.nextState, appMode: AppMode.Terraforming}
        return this
    }

    public get planning(): Transition {
        const homeHexalot = this.nextState.homeHexalot
        if (homeHexalot) {
            const flightTarget = HexalotTarget(homeHexalot, AppMode.Planning)
            this.nextState = {...this.nextState, appMode: AppMode.Flying, flightState: flightTarget}
        }
        return this
    }

    public get exploring(): Transition {
        this.nextState = {...this.nextState, appMode: AppMode.Exploring}
        return this
    }

    public reachedFlightStateTarget(flightState: IFlightState): Transition {
        this.nextState = {...this.nextState, appMode: flightState.appMode}
        return this
    }

    public withJourney(journey?: Journey): Transition {
        this.nextState = {...this.nextState, journey}
        return this
    }

    public async withSelectedHexalot(selectedHexalot?: Hexalot): Promise<Transition> {
        this.nextState = {...this.nextState, selectedHexalot}
        const island = this.nextState.island
        if (selectedHexalot) {
            const flightState = WithHexalot(this.nextState.flightState, selectedHexalot)
            this.nextState = {...this.nextState, flightState}
            await fetchGenome(selectedHexalot, this.nextState.storage)
            if (selectedHexalot.journey) {
                return this.withJourney(selectedHexalot.journey)
            } else if (island) {
                const journey = await fetchJourney(selectedHexalot, this.nextState.storage, island)
                selectedHexalot.journey = journey
                return this.withJourney(journey)
            }
        }
        return this
    }

    public async withSelectedSpot(selectedSpot?: Spot): Promise<Transition> {
        this.nextState = {...this.nextState, selectedSpot}
        if (selectedSpot) {
            const flightState = WithSpot(this.nextState.flightState, selectedSpot)
            this.nextState = {...this.nextState, flightState}
            return this.withSelectedHexalot(selectedSpot.centerOfHexalot)
        }
        return this.withSelectedHexalot()
    }

    public async withHomeHexalot(homeHexalot?: Hexalot): Promise<Transition> {
        const island = this.nextState.island
        if (this.nextState.homeHexalot || !island) {
            throw new Error("Not allowed")
        }
        this.nextState = {...this.nextState, homeHexalot}
        if (!homeHexalot) {
            return this.withJourney().withSelectedSpot()
        }
        return this.withSelectedSpot(homeHexalot.centerSpot)
    }

    public withJockey(jockey: Jockey): Transition {
        this.withoutJockey.nextState = {
            ...this.nextState,
            jockey,
            journey: jockey.leg.journey,
            flightState: JockeyTarget(jockey),
            appMode: AppMode.Flying,
        }
        return this
    }

    public get withJockeyStopped(): Transition {
        const appMode = AppMode.Stopped
        this.nextState = {...this.nextState, appMode}
        return this
    }

    public get withJockeyRiding(): Transition {
        const appMode = AppMode.Riding
        this.nextState = {...this.nextState, appMode}
        return this
    }

    public withEvolution(homeHexalot: Hexalot): Transition {
        const evolution = new Evolution(homeHexalot, this.appState.jockey)
        this.withoutEvolution.nextState = {
            ...this.nextState,
            evolution,
            jockey: undefined,
            flightState: EvolutionTarget(evolution),
            appMode: AppMode.Flying,
        }
        return this
    }

    public get withoutJockey(): Transition {
        const jockey = this.nextState.jockey
        if (jockey) {
            jockey.gotchi.recycle()
            this.nextState = {...this.nextState, jockey: undefined, appMode: AppMode.Flying}
        }
        return this
    }

    public get withoutEvolution(): Transition {
        const evolution = this.nextState.evolution
        if (evolution) {
            evolution.recycle()
            this.nextState = {...this.nextState, evolution: undefined, appMode: AppMode.Flying}
        }
        return this
    }

    public get withRestructure(): Transition {
        const island = this.nextState.island
        if (!island) {
            return this
        }
        recalculateIsland(island)
        const hexalots = island.hexalots
        const spots = island.spots
        const vacant = island.vacantHexalot
        if (hexalots.length === 1) {
            spots.forEach(spot => spot.free = true)
        } else if (vacant) {
            spots.forEach(spot => spot.free = spot.memberOfHexalot.every(h => h.id === vacant.id))
        } else {
            spots.forEach(spot => spot.free = false)
        }
        hexalots.forEach(calculateHexalotId)
        const islandIsLegal = isIslandLegal(island)
        this.nextState = {...this.nextState, islandIsLegal}
        const singleHexalot = island.singleHexalot
        if (!islandIsLegal && singleHexalot) {
            const flightState = HexalotTarget(singleHexalot, AppMode.Terraforming)
            this.nextState = {...this.nextState, flightState}
        }
        return this
    }

    public async withSurface(surface: Surface): Promise<Transition> {
        const nextState = this.nextState
        const selectedSpot = nextState.selectedSpot
        const island = nextState.island
        if (!island || !selectedSpot) {
            return this
        }
        selectedSpot.surface = surface
        selectedSpot.memberOfHexalot.forEach(calculateHexalotId)
        const nextFree = selectedSpot.adjacentSpots.find(s => s.free && s.surface === Surface.Unknown)
        if (nextFree) {
            return this.withSelectedSpot(nextFree)
        }
        const anyFree = island.spots.find(s => s.free && s.surface === Surface.Unknown)
        if (anyFree) {
            return this.withSelectedSpot(anyFree)
        }
        const illegal = island.spots.find(s => !isSpotLegal(s))
        if (illegal) {
            return this.withSelectedSpot(illegal)
        }
        const vacantHexalot = island.vacantHexalot
        if (vacantHexalot) {
            return this.withSelectedSpot(vacantHexalot.centerSpot)
        }
        return this
    }

}
