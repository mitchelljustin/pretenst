/*
 * Copyright (c) 2019. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import { BufferGeometry, Float32BufferAttribute, Quaternion, SphereGeometry, Vector3 } from "three"

import { IFabricEngine, IntervalRole, Laterality } from "./fabric-engine"
import { FloatFeature, roleDefaultLength } from "./fabric-features"
import { FabricInstance } from "./fabric-instance"
import { LifePhase } from "./fabric-state"
import { executeActiveCode, IActiveCode, ICode } from "./tenscript"
import { createBrickOnOrigin, optimizeFabric } from "./tensegrity-brick"
import {
    emptySplit,
    IBrick,
    IFace,
    IInterval,
    IIntervalSplit,
    IJoint,
    intervalSplitter,
    IPercent,
    JointTag,
    percentOrHundred,
    percentToFactor,
    Triangle,
    TRIANGLE_DEFINITIONS,
} from "./tensegrity-brick-types"

interface IOutputInterval {
    joints: string,
    type: string,
    strainString: string,
    elasticity: number,
    elasticityString: string,
    linearDensity: number,
    linearDensityString: string,
    isPush: boolean,
    role: string,
}

export interface IFabricOutput {
    name: string
    joints: {
        index: string,
        x: string,
        y: string,
        z: string,
    }[]
    intervals: IOutputInterval[]
}

export const SPHERE_RADIUS = 0.35
export const SPHERE = new SphereGeometry(SPHERE_RADIUS, 8, 8)

function scaleToElasticity(scale: IPercent): number {
    return percentToFactor(scale) / 10000
}

function elasticityToLinearDensity(elasticity: number): number {
    return Math.sqrt(elasticity)
}

function pretensingAdjustments(strains: Float32Array, existingElasticities: Float32Array, intervals: IInterval[]): {
    elasticities: Float32Array,
    linearDensities: Float32Array,
} {
    const getAverageStrain = (toAverage: IInterval[]) => {
        const totalStrain = toAverage.reduce((sum, interval) => sum + strains[interval.index], 0)
        return totalStrain / toAverage.length
    }
    const getMinMax = (floatArray: number[]) => floatArray.reduce((minMax, value) => {
        const min = Math.min(value, minMax[0])
        const max = Math.max(value, minMax[1])
        return [min, max]
    }, [100000, -100000])
    const pushes = intervals.filter(interval => interval.isPush)
    const averagePushStrain = getAverageStrain(pushes)
    const pulls = intervals.filter(interval => !interval.isPush)
    const averagePullStrain = getAverageStrain(pulls)
    // const intensity = fabricFeatureValue(FabricFeature.PretenseIntensity)
    console.log(`Average push: ${averagePushStrain}`)
    console.log(`Average pull: ${averagePullStrain}`)
    const normalizedStrains = intervals.map(interval => {
        const averageStrain = interval.isPush ? averagePushStrain : averagePullStrain
        return strains[interval.index] - averageStrain
    })
    const minMaxPush = getMinMax(pushes.map(interval => normalizedStrains[interval.index]))
    const minMaxPull = getMinMax(pulls.map(interval => normalizedStrains[interval.index]))
    console.log(`Push: ${minMaxPush[0]}:${minMaxPush[0]}`)
    console.log(`Pull: ${minMaxPull[0]}:${minMaxPull[0]}`)
    const changes = intervals.map(interval => {
        const averageStrain = interval.isPush ? averagePushStrain : averagePullStrain
        const normalizedStrain = strains[interval.index] - averageStrain
        const strainFactor = normalizedStrain / averageStrain
        return 1 + strainFactor
    })
    const elasticities = existingElasticities.map((value, index) => value * changes[index])
    const linearDensities = elasticities.map(elasticityToLinearDensity)
    return {elasticities, linearDensities}
}

export class TensegrityFabric {
    public joints: IJoint[] = []
    public intervals: IInterval[] = []
    public splitIntervals?: IIntervalSplit
    public faces: IFace[] = []
    public activeCode?: IActiveCode[]

    private faceCount: number
    private faceLocations: Float32BufferAttribute
    private faceNormals: Float32BufferAttribute
    private _facesGeometry = new BufferGeometry()

    private intervalCount: number
    private lineLocations: Float32BufferAttribute
    private lineColors: Float32BufferAttribute
    private _linesGeometry = new BufferGeometry()

    private mature = false

    constructor(
        public readonly instance: FabricInstance,
        public readonly slackInstance: FabricInstance,
        public readonly features: FloatFeature[],
        public readonly code: ICode,
    ) {
        features.forEach(feature => this.instance.applyFeature(feature))
        const brick = createBrickOnOrigin(this, percentOrHundred())
        this.activeCode = [{codeTree: this.code.codeTree, brick}]
        this.refreshLineGeometry()
        this.refreshFaceGeometry()
    }

    public toMature(firstTime: boolean): void {
        if (firstTime) {
            this.instance.cloneTo(this.slackInstance)
        } else {
            this.cloneWithNewElasticities()
        }
        this.mature = true
    }

    public selectIntervals(selectionFilter: (interval: IInterval) => boolean): number {
        if (this.activeCode) {
            return 0
        }
        this.splitIntervals = this.intervals.reduce(intervalSplitter(selectionFilter), emptySplit())
        return this.splitIntervals.selected.length
    }

    public clearSelection(): void {
        this.splitIntervals = undefined
    }

    public forEachSelected(operation: (interval: IInterval) => void): number {
        const splitIntervals = this.splitIntervals
        if (!splitIntervals) {
            return 0
        }
        splitIntervals.selected.forEach(operation)
        return splitIntervals.selected.length
    }

    public get growthFaces(): IFace[] {
        return this.faces.filter(face => face.canGrow)
    }

    public removeFace(face: IFace, removeIntervals: boolean): void {
        this.engine.removeFace(face.index)
        this.faces = this.faces.filter(existing => existing.index !== face.index)
        this.faces.forEach(existing => {
            if (existing.index > face.index) {
                existing.index--
            }
        })
        if (removeIntervals) {
            face.pulls.forEach(interval => this.removeInterval(interval))
        }
    }

    public removeInterval(interval: IInterval): void {
        this.engine.removeInterval(interval.index)
        interval.removed = true
        this.intervals = this.intervals.filter(existing => existing.index !== interval.index)
        this.intervals.forEach(existing => {
            if (existing.index > interval.index) {
                existing.index--
            }
        })
        this.instance.forgetDimensions()
    }

    public brickMidpoint({joints}: IBrick, midpoint?: Vector3): Vector3 {
        const accumulator = midpoint ? midpoint : new Vector3()
        return joints
            .reduce((sum, joint) => sum.add(this.instance.location(joint.index)), accumulator)
            .multiplyScalar(1.0 / joints.length)
    }

    public createJointIndex(jointTag: JointTag, location: Vector3): number {
        return this.engine.createJoint(jointTag, Laterality.RightSide, location.x, location.y, location.z)
    }

    public createInterval(alpha: IJoint, omega: IJoint, intervalRole: IntervalRole, scale: IPercent): IInterval {
        const scaleFactor = percentToFactor(scale)
        const defaultLength = roleDefaultLength(intervalRole)
        const restLength = scaleFactor * defaultLength
        const isPush = intervalRole === IntervalRole.Push
        const elasticity = scaleToElasticity(scale)
        const linearDensity = elasticityToLinearDensity(elasticity)
        const index = this.engine.createInterval(alpha.index, omega.index, intervalRole, restLength, elasticity, linearDensity)
        const interval: IInterval = {
            index,
            intervalRole,
            scale,
            alpha, omega,
            removed: false,
            isPush,
        }
        this.intervals.push(interval)
        return interval
    }

    public createFace(brick: IBrick, triangle: Triangle): IFace {
        const joints = TRIANGLE_DEFINITIONS[triangle].pushEnds.map(end => brick.joints[end])
        const pushes = TRIANGLE_DEFINITIONS[triangle].pushEnds.map(end => {
            const foundPush = brick.pushes.find(push => {
                const endJoint = brick.joints[end]
                return endJoint.index === push.alpha.index || endJoint.index === push.omega.index
            })
            if (foundPush === undefined) {
                throw new Error()
            }
            return foundPush
        })
        const pulls = [0, 1, 2].map(offset => brick.pulls[triangle * 3 + offset])
        const face: IFace = {
            index: this.engine.createFace(joints[0].index, joints[1].index, joints[2].index),
            canGrow: true,
            brick, triangle, joints, pushes, pulls,
        }
        this.faces.push(face)
        return face
    }

    public release(): void {
        this.instance.release()
    }

    public needsUpdate(): void {
        const instance = this.instance
        this.faceLocations.array = instance.faceLocations
        this.faceLocations.needsUpdate = true
        this.faceNormals.array = instance.faceNormals
        this.faceNormals.needsUpdate = true
        this.lineLocations.array = instance.lineLocations
        this.lineLocations.needsUpdate = true
        this.lineColors.array = instance.lineColors
        this.lineColors.needsUpdate = true
    }

    public get submergedJoints(): IJoint[] {
        return this.joints.filter(joint => this.instance.location(joint.index).y < 0)
    }

    public get facesGeometry(): BufferGeometry {
        if (this.faceCount !== this.instance.engine.getFaceCount()) {
            this.refreshFaceGeometry()
        }
        return this._facesGeometry
    }

    public get linesGeometry(): BufferGeometry {
        if (this.intervalCount !== this.instance.engine.getIntervalCount()) {
            this.refreshLineGeometry()
        }
        return this._linesGeometry
    }

    public iterate(ticks: number): LifePhase {
        const engine = this.engine
        const lifePhase = engine.iterate(ticks, this.mature)
        if (lifePhase === LifePhase.Busy) {
            return lifePhase
        }
        const activeCode = this.activeCode
        if (activeCode) {
            if (activeCode.length > 0) {
                this.activeCode = executeActiveCode(activeCode)
                engine.centralize()
            }
            if (activeCode.length === 0) {
                optimizeFabric(this)
                this.activeCode = undefined
                if (lifePhase === LifePhase.Growing) {
                    return engine.finishGrowing()
                }
            }
        }
        return lifePhase
    }

    public findInterval(joint1: IJoint, joint2: IJoint): IInterval | undefined {
        return this.intervals.find(interval => (
            (interval.alpha.index === joint1.index && interval.omega.index === joint2.index) ||
            (interval.alpha.index === joint2.index && interval.omega.index === joint1.index)
        ))
    }

    public orientInterval(interval: IInterval, girth: number): { scale: Vector3, rotation: Quaternion } {
        const Y_AXIS = new Vector3(0, 1, 0)
        const unit = this.instance.unitVector(interval.index)
        const rotation = new Quaternion().setFromUnitVectors(Y_AXIS, unit)
        const alphaLocation = this.instance.location(interval.alpha.index)
        const omegaLocation = this.instance.location(interval.omega.index)
        const intervalLength = alphaLocation.distanceTo(omegaLocation)
        const scale = new Vector3(SPHERE_RADIUS * girth, intervalLength / SPHERE_RADIUS / 2, SPHERE_RADIUS * girth)
        return {scale, rotation}
    }

    public get output(): IFabricOutput {
        const numberToString = (n: number) => n.toFixed(5).replace(/[.]/, ",")
        const strains = this.instance.strains
        const elasticities = this.instance.elasticities
        const linearDensities = this.instance.linearDensities
        return {
            name: this.code.codeString,
            joints: this.joints.map(joint => {
                const vector = this.instance.location(joint.index)
                return {
                    index: (joint.index + 1).toString(),
                    x: numberToString(vector.x),
                    y: numberToString(vector.z),
                    z: numberToString(vector.y),
                }
            }),
            intervals: this.intervals.map(interval => {
                const joints = `${interval.alpha.index + 1},${interval.omega.index + 1}`
                const strainString = numberToString(strains[interval.index])
                const type = interval.isPush ? "Push" : "Pull"
                const elasticity = elasticities[interval.index]
                const elasticityString = numberToString(elasticity)
                const linearDensity = linearDensities[interval.index]
                const linearDensityString = numberToString(linearDensity)
                const role = IntervalRole[interval.intervalRole]
                const isPush = interval.isPush
                return <IOutputInterval>{
                    joints,
                    type,
                    strainString,
                    elasticity,
                    elasticityString,
                    linearDensity,
                    linearDensityString,
                    isPush,
                    role,
                }
            }).sort((a, b) => {
                if (a.isPush && !b.isPush) {
                    return -1
                }
                if (!a.isPush && b.isPush) {
                    return 1
                }
                return a.elasticity - b.elasticity
            }),
        }
    }

    private cloneWithNewElasticities(): void {
        const {elasticities, linearDensities} = pretensingAdjustments(
            this.instance.strains,
            this.instance.elasticities,
            this.intervals,
        )
        this.instance.cloneFrom(this.slackInstance)
        this.elasticities = elasticities
        this.linearDensities = linearDensities
        this.features.forEach(feature => this.instance.applyFeature(feature))
    }

    private refreshLineGeometry(): void {
        this.iterate(0)
        this.intervalCount = this.instance.engine.getIntervalCount()
        this.lineLocations = new Float32BufferAttribute(this.instance.lineLocations, 3)
        this.lineColors = new Float32BufferAttribute(this.instance.lineColors, 3)
        this._linesGeometry.addAttribute("position", this.lineLocations)
        this._linesGeometry.addAttribute("color", this.lineColors)
    }

    private refreshFaceGeometry(): void {
        this.iterate(0)
        this.faceCount = this.instance.engine.getFaceCount()
        this.faceLocations = new Float32BufferAttribute(this.instance.faceLocations, 3)
        this.faceNormals = new Float32BufferAttribute(this.instance.faceNormals, 3)
        this._facesGeometry.addAttribute("position", this.faceLocations)
        this._facesGeometry.addAttribute("normal", this.faceNormals)
    }

    private set elasticities(elasticities: Float32Array) {
        const destination = this.instance.elasticities
        elasticities.forEach((value, index) => destination[index] = value)
    }

    private set linearDensities(linearDensities: Float32Array) {
        const destination = this.instance.linearDensities
        linearDensities.forEach((value, index) => destination[index] = value)
    }

    private get engine(): IFabricEngine {
        return this.instance.engine
    }
}
