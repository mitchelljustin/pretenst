/*
 * Copyright (c) 2019. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import { Fabric, Stage, WorldFeature } from "eig"
import { BehaviorSubject } from "rxjs"
import { Vector3 } from "three"

import { IFabricOutput, IOutputInterval, IOutputJoint } from "../storage/download"

import { IntervalRole, intervalRoleName, isConnectorRole, isFaceRole, isPushRole, roleDefaultLength } from "./eig-util"
import { FabricInstance } from "./fabric-instance"
import { ILifeTransition, Life } from "./life"
import { execute, IBud, IMark, ITenscript, MarkAction } from "./tenscript"
import { TensegrityBuilder } from "./tensegrity-builder"
import { scaleToInitialStiffness } from "./tensegrity-optimizer"
import {
    faceConnectorLengthFromScale,
    factorFromPercent,
    IFace,
    IFaceInterval,
    IInterval,
    IJoint,
    intervalLength,
    IPercent,
    IPullComplex,
    jointDistance,
    jointHolesFromJoint,
    jointLocation,
    locationFromFace,
    percentFromFactor,
    percentOrHundred,
    Spin,
} from "./tensegrity-types"

export class Tensegrity {
    public life$: BehaviorSubject<Life>
    public joints: IJoint[] = []
    public intervals: IInterval[] = []
    public pullComplexes: IPullComplex[] = []
    public faceIntervals: IFaceInterval[] = []
    public faces: IFace[] = []
    public pushesPerTwist: number
    public buds?: IBud[]
    private transitionQueue: ILifeTransition[] = []

    constructor(
        public readonly location: Vector3,
        public readonly scale: IPercent,
        public readonly numericFeature: (worldFeature: WorldFeature) => number,
        public readonly instance: FabricInstance,
        public readonly tenscript: ITenscript,
    ) {
        this.instance.clear()
        this.life$ = new BehaviorSubject(new Life(numericFeature, this, Stage.Growing))
        this.pushesPerTwist = this.tenscript.pushesPerTwist
        this.buds = [new TensegrityBuilder(this).createBud(this.tenscript)]
    }

    public get fabric(): Fabric {
        return this.instance.fabric
    }

    public lifeTransition(tx: ILifeTransition): void {
        const life = this.life$.getValue()
        if (tx.stage === life.stage) {
            return
        }
        this.life$.next(life.executeTransition(tx))
    }

    public createJoint(location: Vector3): IJoint {
        const index = this.fabric.create_joint(location.x, location.y, location.z)
        const newJoint: IJoint = {index, instance: this.instance}
        this.joints.push(newJoint)
        return newJoint
    }

    public createFaceConnector(alpha: IFace, omega: IFace): IFaceInterval {
        return this.createFaceInterval(alpha, omega)
    }

    public createFaceConnectorComplex(alpha: IFace, omega: IFace): IPullComplex {
        return this.createFacePullComplex(alpha, omega)
    }

    public createFaceDistancer(alpha: IFace, omega: IFace, pullScale: IPercent): IFaceInterval {
        return this.createFaceInterval(alpha, omega, pullScale)
    }

    public removeFaceInterval(interval: IFaceInterval): void {
        this.faceIntervals = this.faceIntervals.filter(existing => existing.index !== interval.index)
        this.eliminateInterval(interval.index)
        interval.removed = true
    }

    public createConnector(alpha: IJoint, omega: IJoint, stiffness: number, linearDensity: number): IInterval {
        const idealLength = jointDistance(alpha, omega)
        const intervalRole = IntervalRole.ConnectorPull
        const restLength = 0.1 // todo: what about the connector?
        const scale = percentOrHundred()
        const countdown = this.numericFeature(WorldFeature.IntervalCountdown) * Math.abs(restLength - idealLength)
        const index = this.fabric.create_interval(
            alpha.index, omega.index, false, false, true,
            idealLength, restLength, stiffness, linearDensity, countdown)
        const interval: IInterval = {index, alpha, omega, intervalRole, scale, removed: false}
        this.intervals.push(interval)
        return interval
    }

    public createScaledInterval(alpha: IJoint, omega: IJoint, intervalRole: IntervalRole, scale: IPercent): IInterval {
        const currentLength = jointDistance(alpha, omega)
        const idealLength = factorFromPercent(scale) * roleDefaultLength(intervalRole)
        const countdown = this.numericFeature(WorldFeature.IntervalCountdown) * Math.abs(currentLength - idealLength)
        const stiffness = scaleToInitialStiffness(scale)
        const linearDensity = Math.sqrt(stiffness)
        const restLength = roleDefaultLength(intervalRole) * factorFromPercent(scale)
        const index = this.fabric.create_interval(
            alpha.index, omega.index, isPushRole(intervalRole), isFaceRole(intervalRole), isConnectorRole(intervalRole),
            idealLength, restLength, stiffness, linearDensity, countdown)
        const interval: IInterval = {index, intervalRole, scale, alpha, omega, removed: false}
        this.intervals.push(interval)
        return interval
    }

    public changeIntervalScale(interval: IInterval, factor: number): void {
        interval.scale = percentFromFactor(factorFromPercent(interval.scale) * factor)
        this.fabric.multiply_rest_length(interval.index, factor, 100)
    }

    public removeInterval(interval: IInterval): void {
        this.intervals = this.intervals.filter(existing => existing.index !== interval.index)
        this.eliminateInterval(interval.index)
        interval.removed = true
    }

    public createFace(ends: IJoint[], omni: boolean, spin: Spin, scale: IPercent, knownPulls?: IInterval[]): IFace {
        const pull = (a: IJoint, b: IJoint) => {
            for (let walk = this.intervals.length - 1; walk >= 0; walk--) { // backwards: more recent
                const interval = this.intervals[walk]
                const {alpha, omega} = interval
                if (alpha.index === a.index && omega.index === b.index ||
                    omega.index === a.index && alpha.index === b.index) {
                    return interval
                }
            }
            throw new Error("Could not find pull")
        }
        const f0 = ends[0]
        const f1 = ends[Math.floor(ends.length / 3)]
        const f2 = ends[Math.floor(2 * ends.length / 3)]
        const index = this.fabric.create_face(f0.index, f1.index, f2.index)
        const pulls = knownPulls ? knownPulls : [pull(f0, f1), pull(f1, f2), pull(f2, f0)]
        const face: IFace = {index, omni, spin, scale, ends, pulls}
        this.faces.push(face)
        return face
    }

    public removeFace(face: IFace): void {
        face.pulls.forEach(pull => this.removeInterval(pull))
        face.pulls = []
        this.fabric.remove_face(face.index)
        this.faces = this.faces.filter(existing => existing.index !== face.index)
        this.faces.forEach(existing => {
            if (existing.index > face.index) {
                existing.index--
            }
        })
    }

    public startTightening(intervals: IFaceInterval[]): void {
        this.faceIntervals = intervals
    }

    public set transition(tx: ILifeTransition) {
        if (tx.stage === undefined) {
            throw new Error("Undefined stage!")
        }
        this.transitionQueue.push(tx)
    }

    public iterate(): Stage | undefined {
        const tx = this.transitionQueue.shift()
        if (tx) {
            this.lifeTransition(tx)
        }
        const stage = this.instance.iterate(this.life$.getValue().stage)
        if (stage === undefined) {
            return undefined
        }
        const activeCode = this.buds
        const builder = () => new TensegrityBuilder(this)
        if (activeCode) {
            if (activeCode.length > 0) {
                this.buds = execute(activeCode)
            }
            if (activeCode.length === 0) {
                this.buds = undefined
                faceStrategies(this.faces, this.tenscript.marks, builder()).forEach(strategy => strategy.execute())
                if (stage === Stage.Growing) {
                    return this.fabric.finish_growing()
                }
            }
            return Stage.Growing
        }
        if (this.faceIntervals.length > 0) {
            this.faceIntervals = builder().checkFaceIntervals(this.faceIntervals, interval => this.removeFaceInterval(interval))
        }
        return stage
    }

    public findInterval(joint1: IJoint, joint2: IJoint): IInterval | undefined {
        return this.intervals.find(interval => (
            (interval.alpha.index === joint1.index && interval.omega.index === joint2.index) ||
            (interval.alpha.index === joint2.index && interval.omega.index === joint1.index)
        ))
    }

    public getFabricOutput(pushRadius: number, pullRadius: number, jointRadius: number): IFabricOutput {
        this.instance.refreshFloatView()
        const idealLengths = this.instance.floatView.idealLengths
        const strains = this.instance.floatView.strains
        const stiffnesses = this.instance.floatView.stiffnesses
        const linearDensities = this.instance.floatView.linearDensities
        return {
            name: this.tenscript.name,
            joints: this.joints.map(joint => {
                const vector = jointLocation(joint)
                const holes = jointHolesFromJoint(joint, this.intervals)
                return <IOutputJoint>{
                    index: joint.index,
                    radius: jointRadius,
                    x: vector.x, y: vector.z, z: vector.y,
                    anchor: false, // TODO: can this be determined?
                    holes,
                }
            }),
            intervals: this.intervals.map(interval => {
                const isPush = isPushRole(interval.intervalRole)
                const radius = isPush ? pushRadius : pullRadius
                const currentLength = intervalLength(interval)
                const alphaIndex = interval.alpha.index
                const omegaIndex = interval.omega.index
                if (alphaIndex >= this.joints.length || omegaIndex >= this.joints.length) {
                    throw new Error(`Joint not found ${intervalRoleName(interval.intervalRole)}:${alphaIndex},${omegaIndex}:${this.joints.length}`)
                }
                return <IOutputInterval>{
                    index: interval.index,
                    joints: [alphaIndex, omegaIndex],
                    type: isPush ? "Push" : "Pull",
                    strain: strains[interval.index],
                    stiffness: stiffnesses[interval.index],
                    linearDensity: linearDensities[interval.index],
                    role: intervalRoleName(interval.intervalRole),
                    scale: interval.scale._,
                    idealLength: idealLengths[interval.index],
                    isPush,
                    length: currentLength,
                    radius,
                }
            }),
        }
    }

    private createFaceInterval(alpha: IFace, omega: IFace, pullScale?: IPercent): IFaceInterval {
        const connector = !pullScale
        const intervalRole = connector ? IntervalRole.FaceConnector : IntervalRole.FaceDistancer
        const idealLength = locationFromFace(alpha).distanceTo(locationFromFace(omega))
        const stiffness = scaleToInitialStiffness(percentOrHundred())
        const linearDensity = Math.sqrt(stiffness)
        const scaleFactor = (factorFromPercent(alpha.scale) + factorFromPercent(omega.scale)) / 2
        const restLength = !pullScale ? faceConnectorLengthFromScale(scaleFactor) : factorFromPercent(pullScale) * idealLength
        const countdown = idealLength * this.numericFeature(WorldFeature.IntervalCountdown)
        const index = this.fabric.create_interval(
            alpha.index, omega.index, isPushRole(intervalRole), isFaceRole(intervalRole), isConnectorRole(intervalRole),
            idealLength, restLength, stiffness, linearDensity, countdown,
        )
        const interval: IFaceInterval = {index, alpha, omega, connector, scaleFactor, removed: false}
        this.faceIntervals.push(interval)
        return interval
    }

    private createFacePullComplex(alpha: IFace, omega: IFace, pullScale?: IPercent): IPullComplex {
        const connector = !pullScale
        const stiffness = scaleToInitialStiffness(percentOrHundred())
        const linearDensity = Math.sqrt(stiffness)
        const alphaJoint = this.createJoint(locationFromFace(alpha))
        const omegaJoint = this.createJoint(locationFromFace(omega))
        this.instance.refreshFloatView()
        const hub = this.createConnector(alphaJoint, omegaJoint, stiffness, linearDensity)
        const alphaSpokes = alpha.ends.map(end => this.createScaledInterval(alphaJoint, end, IntervalRole.RadialPull, alpha.scale))
        const omegaSpokes = omega.ends.map(end => this.createScaledInterval(omegaJoint, end, IntervalRole.RadialPull, omega.scale))
        const complex: IPullComplex = {hub, alphaSpokes, omegaSpokes, connector}
        this.pullComplexes.push(complex)
        return complex
    }

    private eliminateInterval(index: number): void {
        this.fabric.remove_interval(index)
        this.faceIntervals.forEach(existing => {
            if (existing.index > index) {
                existing.index--
            }
        })
        this.intervals.forEach(existing => {
            if (existing.index > index) {
                existing.index--
            }
        })
    }
}

function faceStrategies(faces: IFace[], marks: Record<number, IMark>, builder: TensegrityBuilder): FaceStrategy[] {
    const collated: Record<number, IFace[]> = {}
    faces.forEach(face => {
        if (face.mark === undefined) {
            return
        }
        const found = collated[face.mark._]
        if (found) {
            found.push(face)
        } else {
            collated[face.mark._] = [face]
        }
    })
    return Object.entries(collated).map(([key, value]) => {
        const possibleMark = marks[key]
        const mark = possibleMark ? possibleMark :
            value.length === 1 ?
                <IMark>{action: MarkAction.BaseFace} :
                <IMark>{action: MarkAction.JoinFaces}
        return new FaceStrategy(collated[key], mark, builder)
    })
}

class FaceStrategy {
    constructor(private faces: IFace[], private mark: IMark, private builder: TensegrityBuilder) {
    }

    public execute(): void {
        switch (this.mark.action) {
            case MarkAction.Subtree:
                break
            case MarkAction.BaseFace:
                this.builder.faceToOrigin(this.faces[0])
                break
            case MarkAction.JoinFaces:
            case MarkAction.FaceDistance:
                this.builder.createFacePullComplexes(this.faces, this.mark)
                // this.builder.createFaceIntervals(this.faces, this.mark)
                break
            case MarkAction.Anchor:
                // this.builder.createFaceAnchor(this.faces[0], this.mark)
                break
        }
    }
}


