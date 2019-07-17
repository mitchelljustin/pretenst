/*
 * Copyright (c) 2019. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import { PerspectiveCamera, Vector3 } from "three"
import { OrbitControls } from "three-orbitcontrols-ts"

import { AppMode, IAppState } from "../state/app-state"
import { Transition } from "../state/transition"

import { IFlightState } from "./flight-state"

export const INITIAL_DISTANCE = 15000
export const MINIMUM_DISTANCE = 7

const MIN_POLAR_ANGLE = Math.PI * 0.01
const MAX_POLAR_ANGLE = 0.98 * Math.PI / 2

export function polarAngle(aboveness: number): number { // aboveness [0,1]
    return (1 - aboveness) * MAX_POLAR_ANGLE + aboveness * MIN_POLAR_ANGLE
}

const TOWARDS_UPWARDS = 0.3
const TOWARDS_TARGET = 0.02

export class Flight {
    private target = new Vector3()
    private targetToCamera = new Vector3()
    private targetToMovingTarget = new Vector3()

    constructor(private orbit: OrbitControls) {
        orbit.enabled = false
        orbit.minPolarAngle = MIN_POLAR_ANGLE
        orbit.maxPolarAngle = MAX_POLAR_ANGLE
        orbit.maxDistance = INITIAL_DISTANCE
        orbit.minDistance = MINIMUM_DISTANCE
        orbit.enableKeys = false
        orbit.zoomSpeed = 0.5
        orbit.target = this.target
    }

    public setupCamera(flightState: IFlightState): void {
        const angleAboveHorizon = (flightState.tooHorizontal + flightState.tooVertical) / 2
        const distance = (flightState.tooFar + flightState.tooClose) / 2
        this.camera.position.set(
            0,
            distance * Math.sin(angleAboveHorizon),
            distance * Math.cos(angleAboveHorizon),
        )
    }

    public update(appState: IAppState): void {
        const flightState = appState.flightState
        this.moveTowardsTarget(flightState.target)
        switch (appState.appMode) {
            case AppMode.Flying:
                const distanceChanged = this.cameraFollowDistance(flightState)
                const angleChanged = this.cameraFollowPolarAngle(flightState)
                if (!(distanceChanged || angleChanged)) {
                    this.orbit.enabled = true
                    appState.updateState(new Transition(appState).reachedFlightStateTarget(flightState).appState)
                }
                break
            case AppMode.Riding:
                this.cameraFollowDistance(flightState)
                this.cameraFollowPolarAngle(flightState)
                break
            default:
                break
        }
        this.stayUpright()
        this.orbit.update()
    }

    // ============================

    private stayUpright(): void {
        const up = this.camera.up
        up.y += TOWARDS_UPWARDS
        up.normalize()
    }

    private moveTowardsTarget(movingTarget: Vector3): void {
        this.target.add(this.targetToMovingTarget.subVectors(movingTarget, this.target).multiplyScalar(TOWARDS_TARGET))
    }

    private cameraFollowDistance(flightState: IFlightState): boolean {
        const currentDistance = this.calculateTargetToCamera().length()
        if (currentDistance > flightState.tooClose && currentDistance < flightState.tooFar) {
            return false
        }
        const distance = (flightState.tooFar + flightState.tooClose) / 2
        const nextDistance = currentDistance * (1 - flightState.towardsDistance) + distance * flightState.towardsDistance
        this.targetToCamera.normalize().multiplyScalar(nextDistance)
        this.camera.position.addVectors(this.target, this.targetToCamera)
        return true
    }

    private cameraFollowPolarAngle(flightState: IFlightState): boolean {
        const currentPolarAngle = this.orbit.getPolarAngle()
        if (currentPolarAngle < flightState.tooVertical) {
            this.orbit.rotateUp(-flightState.towardsPolarAngle)
            return true
        }
        if (currentPolarAngle > flightState.tooHorizontal) {
            this.orbit.rotateUp(flightState.towardsPolarAngle)
            return true
        }
        return false
    }

    private calculateTargetToCamera(): Vector3 {
        return this.targetToCamera.subVectors(this.camera.position, this.target)
    }

    private get camera(): PerspectiveCamera {
        return <PerspectiveCamera>this.orbit.object
    }
}
