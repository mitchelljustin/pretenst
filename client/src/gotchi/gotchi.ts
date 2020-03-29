/*
 * Copyright (c) 2020. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import { Stage } from "eig"
import { BufferGeometry, Float32BufferAttribute, Vector3 } from "three"

import { FabricInstance } from "../fabric/fabric-instance"
import { Tensegrity } from "../fabric/tensegrity"
import { IFace, Triangle, TRIANGLE_DEFINITIONS } from "../fabric/tensegrity-types"

import { Genome, IGenomeData } from "./genome"
import { Hexalot } from "./hexalot"
import { Leg } from "./journey"
import { TimeCycle } from "./time-cycle"

const MAX_VOTES = 30

export enum Direction {
    Rest = "Rest",
    Forward = "Forward",
    Left = "Left",
    Right = "Right",
}

export const DIRECTIONS = Object.keys(Direction).map(k => Direction[k])

export interface IExtremity {
    faceIndex: number
    name: string
    limb: Limb
}

export interface IMuscle {
    faceIndex: number
    name: string
    limb: Limb
    distance: number
    group: Triangle
    triangle: Triangle
}

export enum Limb {
    FrontLeft = "front-left",
    FrontRight = "front-right",
    BackLeft = "back-left",
    BackRight = "back-right",
}

export interface IGotchiSeed {
    instance: object
    genome?: Genome
    embryo?: Tensegrity
    muscles: IMuscle[]
    extremities: IExtremity[]
}

export type CreateGotchi = (hexalot: Hexalot, rotation: number, seed: IGotchiSeed) => Gotchi

export class Gotchi {
    public instance: FabricInstance
    public genome: Genome
    public muscles: IMuscle[] = []
    public extremities: IExtremity[] = []
    public cycleCount = 0

    private embryo?: Tensegrity
    private votes: Direction[] = []
    private _direction = Direction.Rest
    private _nextDirection = Direction.Rest
    private currentLeg: Leg
    private shapingTime = 60
    private twitchCycle: Record<string, TimeCycle> = {}
    private timeSlice = 0
    private timeCycles = 0

    constructor(public readonly hexalot: Hexalot, leg: Leg, seed: IGotchiSeed) {
        if (!seed.instance) {
            throw new Error("Missing instance")
        }
        if (!seed.genome) {
            throw new Error("Missing genome")
        }
        this.instance = seed.instance as FabricInstance
        this.genome = seed.genome
        this.currentLeg = leg
        this.embryo = seed.embryo
        this.muscles = seed.muscles
        this.extremities = seed.extremities
        if (!this.embryo) {
            this.genomeToTwitchCycle(this.genome)
        }
    }

    public get isMature(): boolean {
        return !this.embryo
    }

    public getExtremity(whichLimb: Limb): IExtremity {
        const extremity = this.extremities.find(({limb}) => limb === whichLimb)
        if (!extremity) {
            throw new Error("No extremity found")
        }
        return extremity
    }

    public mutatedGenome(mutationCount: number): IGenomeData {
        if (!this.genome) {
            throw new Error("Not evolving")
        }
        return this.genome.withMutations(this.nextDirection, mutationCount).genomeData
    }

    public get age(): number {
        return this.instance.fabric.age
    }

    public get direction(): Direction {
        return this._direction
    }

    public get nextDirection(): Direction {
        return this._nextDirection
    }

    public set nextDirection(direction: Direction) {
        this._nextDirection = direction
    }

    public get leg(): Leg {
        return this.currentLeg
    }

    public set leg(leg: Leg) {
        this.currentLeg = leg
        this.votes = []
        this._nextDirection = this.voteDirection()
    }

    public iterate(midpoint: Vector3): void {
        const view = this.instance.view
        midpoint.set(view.midpoint_x(), view.midpoint_y(), view.midpoint_z())
        const embryo = this.embryo
        if (!embryo) {
            this.instance.iterate(Stage.Realized)
            const twitchCycle = this.twitchCycle[this.direction]
            if (!twitchCycle) {
                return
            }
            this.timeCycles++
            if (this.timeCycles < 7) {
                return
            }
            this.timeCycles = 0
            this.timeSlice++
            if (this.timeSlice >= 36) {
                this.timeSlice = 0
                this.cycleCount++
                console.log("cycle count", this.cycleCount)
            }
            twitchCycle.activate(this.timeSlice, (whichMuscle: number, attack: number, decay: number) => (
                twitch(this.instance, this.muscles[whichMuscle], attack, decay)
            ))
        } else {
            const stage = embryo.iterate()
            switch (stage) {
                case Stage.Shaping:
                    if (this.shapingTime <= 0) {
                        this.instance.fabric.adopt_lengths()
                        const faceIntervals = [...embryo.faceIntervals]
                        faceIntervals.forEach(interval => embryo.removeFaceInterval(interval))
                        this.instance.iterate(Stage.Slack)
                        this.instance.iterate(Stage.Realizing)
                    } else {
                        this.shapingTime--
                        // console.log("shaping", this.shapingTime)
                    }
                    break
                case Stage.Realized:
                    extractGotchiFaces(embryo, this.muscles, this.extremities)
                    this.embryo = undefined
                    this.genomeToTwitchCycle(this.genome)
                    break
            }
        }
    }

    public reorient(): void {
        if (this.touchedDestination) {
            const nextLeg = this.leg.nextLeg
            if (nextLeg) {
                this.leg = nextLeg
            } else {
                this.nextDirection = Direction.Rest
            }
        }
        if (this.nextDirection !== Direction.Rest) {
            const direction = this.voteDirection()
            if (this.nextDirection !== direction) {
                // console.log(`${this.index} turned ${Direction[this.nextDirection]} to ${Direction[direction]}`)
                this.nextDirection = direction
            }
        }
    }

    public get facesGeometry(): BufferGeometry {
        const faceLocations = new Float32BufferAttribute(this.instance.floatView.faceLocations, 3)
        const faceNormals = new Float32BufferAttribute(this.instance.floatView.faceNormals, 3)
        const geometry = new BufferGeometry()
        geometry.addAttribute("position", faceLocations)
        geometry.addAttribute("normal", faceNormals)
        geometry.computeBoundingSphere()
        return geometry
    }

    public get linesGeometry(): BufferGeometry {
        const lineLocations = new Float32BufferAttribute(this.instance.floatView.lineLocations, 3)
        const lineColors = new Float32BufferAttribute(this.instance.floatView.lineColors, 3)
        const geometry = new BufferGeometry()
        geometry.addAttribute("position", lineLocations)
        geometry.addAttribute("color", lineColors)
        geometry.computeBoundingSphere()
        return geometry
    }

    public get target(): Vector3 {
        return this.currentLeg.goTo.center
    }

    private genomeToTwitchCycle(genome: Genome): void {
        Object.keys(Direction).forEach(key => {
            const direction = Direction[key]
            const reader = genome.createReader(direction)
            const mutationCount = genome.mutationCount(direction)
            const twitchCount = Math.ceil(Math.log(mutationCount)) + 1
            if (key === "Rest") {
                console.log(`twitchCount=${twitchCount} from ${mutationCount}`)
            }
            this.twitchCycle[key] = new TimeCycle(reader, this.muscles, twitchCount)
        })
    }

    private get touchedDestination(): boolean {
        return false // this.midpoint.distanceTo(this.target) < 1 // TODO: how close?
    }

    private voteDirection(): Direction {
        const votes = this.votes
        const latestVote = this.directionToTarget
        votes.push(latestVote)
        if (votes.length > MAX_VOTES) {
            votes.shift()
        }
        const voteCounts = votes.reduce((c: number[], vote) => {
            c[vote]++
            return c
        }, [0, 0, 0, 0, 0])
        const found = DIRECTIONS.find(direction => (
            voteCounts[direction] === MAX_VOTES && this._nextDirection !== direction
        ))
        return found ? found : latestVote
    }

    private get directionToTarget(): Direction {
        const toTarget = this.toTarget
        const degreeForward = toTarget.dot(this.instance.forward)
        const degreeRight = toTarget.dot(this.instance.right)
        if (degreeForward > 0) {
            if (degreeRight > 0) {
                return degreeForward > degreeRight ? Direction.Forward : Direction.Right
            } else {
                return degreeForward > -degreeRight ? Direction.Forward : Direction.Left
            }
        } else {
            return Direction.Forward // was reverse logic?
        }
    }

    private get toTarget(): Vector3 {
        const toTarget = new Vector3()
        const view = this.instance.view
        const midpoint = new Vector3(view.midpoint_x(), view.midpoint_y(), view.midpoint_z())
        toTarget.subVectors(this.target, midpoint)
        toTarget.y = 0
        toTarget.normalize()
        return toTarget
    }
}

function twitch(instance: FabricInstance, muscle: IMuscle, attack: number, decay: number): void {
    const deltaSize = 0.7
    instance.fabric.twitch_face(muscle.faceIndex, deltaSize, attack, decay)
    // console.log(`twitch ${muscle.name} ${muscle.faceIndex}: ${attack}, ${decay}`)
}

export function oppositeMuscleIndex(whichMuscle: number, muscles: IMuscle[]): number {
    const {name, limb, distance, triangle} = muscles[whichMuscle]
    const oppositeTriangle = TRIANGLE_DEFINITIONS[triangle].opposite
    const findLimb = oppositeLimb(limb)
    const oppositeIndex = muscles.findIndex(m => m.limb === findLimb && m.distance === distance && m.triangle === oppositeTriangle)
    if (oppositeIndex < 0) {
        throw new Error(`Unable to find opposite muscle to ${name}`)
    }
    // console.log(`opposite of ${name} is ${muscles[oppositeIndex].name}`)
    return oppositeIndex
}

function extractGotchiFaces(tensegrity: Tensegrity, muscles: IMuscle[], extremities: IExtremity[]): void {
    tensegrity.faces
        .filter(face => !face.removed && face.brick.parentFace)
        .forEach(face => {
            const gatherAncestors = (f: IFace, id: Triangle[]): Limb => {
                const definition = TRIANGLE_DEFINITIONS[f.triangle]
                id.push(definition.negative ? definition.opposite : definition.name)
                const parentFace = f.brick.parentFace
                if (parentFace) {
                    return gatherAncestors(parentFace, id)
                } else {
                    return limbFromTriangle(f.triangle)
                }
            }
            const identities: Triangle[] = []
            const limb = gatherAncestors(face, identities)
            const group = identities.shift()
            const triangle = face.triangle
            if (!group) {
                throw new Error("no top!")
            }
            const distance = identities.length
            const faceIndex = face.index
            if (isTriangleExtremity(group)) {
                const name = `[${limb}]`
                extremities.push({faceIndex, name, limb})
            } else {
                const name = `[${limb}]:[${distance}:${Triangle[group]}]:{tri=${Triangle[triangle]}}`
                muscles.push({faceIndex, name, limb, distance, group, triangle})
            }
        })
}

function isTriangleExtremity(triangle: Triangle): boolean {
    const definition = TRIANGLE_DEFINITIONS[triangle]
    const normalizedTriangle = definition.negative ? definition.opposite : triangle
    return normalizedTriangle === Triangle.PPP
}

function limbFromTriangle(triangle: Triangle): Limb {
    switch (triangle) {
        case Triangle.NNN:
            return Limb.BackLeft
        case Triangle.PNN:
            return Limb.BackRight
        case Triangle.NPP:
            return Limb.FrontLeft
        case Triangle.PPP:
            return Limb.FrontRight
        default:
            throw new Error("Strange limb")
    }
}

function oppositeLimb(limb: Limb): Limb {
    switch (limb) {
        case Limb.BackRight:
            return Limb.BackLeft
        case Limb.BackLeft:
            return Limb.BackRight
        case Limb.FrontRight:
            return Limb.FrontLeft
        case Limb.FrontLeft:
            return Limb.FrontRight
        default:
            throw new Error("Strange limb")
    }
}
