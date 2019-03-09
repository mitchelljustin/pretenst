import {Vector3} from "three"

import {Direction} from "../body/fabric-exports"
import {Leg} from "../island/journey"
import {HEXAPOD_RADIUS} from "../island/shapes"

import {Gotchi} from "./gotchi"

export const compareEvolvers = (a: Evolver, b: Evolver) => a.toDestination - b.toDestination

const MAX_VOTES = 30

export class Evolver {

    public toDestination = 0
    public currentDirection = Direction.REST
    private toTarget = new Vector3()
    private votes: Direction[] = []
    private currentLeg: Leg

    constructor(public gotchi: Gotchi, leg: Leg) {
        this.currentLeg = leg
        this.voteDirection()
    }

    public set leg(leg: Leg) {
        this.currentLeg = leg
        this.votes = []
        this.voteDirection()
    }

    public get index(): number {
        return this.gotchi.index
    }

    public voteDirection(): Direction | undefined {
        const votes = this.votes
        votes.push(this.directionToTarget)
        if (votes.length > MAX_VOTES) {
            votes.shift()
        }
        const counts = votes.reduce((c: number[], vote) => {
            c[vote]++
            return c
        }, [0, 0, 0, 0, 0])
        for (let dir = Direction.FORWARD; dir <= Direction.REVERSE; dir++) {
            if (counts[dir] === MAX_VOTES && this.currentDirection !== dir) {
                this.currentDirection = dir
                console.log(`Direction ${Direction[this.currentDirection]}`)
                return this.currentDirection
            }
        }
        return undefined
    }

    public calculateFitness(): void {
        this.toDestination = this.gotchi.getDistanceFrom(this.target)
    }

    public get touchedDestination(): boolean {
        return this.gotchi.getDistanceFrom(this.target) < HEXAPOD_RADIUS
    }

    private get directionToTarget(): Direction {
        const fabric = this.gotchi.fabric
        const toTarget = this.toTarget
        toTarget.subVectors(this.target, fabric.seed).normalize()
        const degreeForward = toTarget.dot(fabric.forward)
        const degreeRight = toTarget.dot(fabric.right)
        if (degreeForward > 0) {
            if (degreeRight > 0) {
                return degreeForward > degreeRight ? Direction.FORWARD : Direction.RIGHT
            } else {
                return degreeForward > -degreeRight ? Direction.FORWARD : Direction.LEFT
            }
        } else {
            if (degreeRight > 0) {
                return -degreeForward > degreeRight ? Direction.REVERSE : Direction.RIGHT
            } else {
                return -degreeForward > -degreeRight ? Direction.REVERSE : Direction.LEFT
            }
        }
    }

    private get target(): Vector3 {
        return this.currentLeg.goTo.center
    }
}

