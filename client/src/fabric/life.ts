/*
 * Copyright (c) 2019. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import { FabricFeature, Stage } from "./fabric-engine"
import { FloatFeature } from "./fabric-features"
import { TensegrityFabric } from "./tensegrity-fabric"
import { IInterval } from "./tensegrity-types"

export interface ITransitionPrefs {
    strainToStiffness?: boolean
    adoptLengths?: boolean
}

export class Life {
    private _stage: Stage

    constructor(private fabric: TensegrityFabric, stage: Stage) {
        this._stage = stage
    }

    public withStage(stage: Stage, prefs?: ITransitionPrefs): Life {
        this.transition(stage, prefs)
        this._stage = stage
        return new Life(this.fabric, stage)
    }

    public get stage(): Stage {
        return this._stage
    }

    private transition(stage: Stage, prefs?: ITransitionPrefs): void {
        switch (this._stage) {
            case Stage.Growing:
                switch (stage) {
                    case Stage.Shaping:
                        this.save()
                        return
                }
                break
            case Stage.Shaping:
                switch (stage) {
                    case Stage.Slack:
                        if (prefs && prefs.adoptLengths) {
                            this.fabric.instance.engine.adoptLengths()
                            this.save()
                        }
                        return
                    case Stage.Realizing:
                        return
                }
                break
            case Stage.Slack:
                switch (stage) {
                    case Stage.Shaping:
                        return
                    case Stage.Realizing:
                        return
                }
                break
            case Stage.Realizing:
                switch (stage) {
                    case Stage.Realized:
                        return
                }
                break
            case Stage.Realized:
                switch (stage) {
                    case Stage.Slack:
                        if (prefs && prefs.strainToStiffness) {
                            const {newStiffnesses, newLinearDensities} = adjustedStiffness(this.fabric)
                            this.restore()
                            const instance = this.fabric.instance
                            newStiffnesses.forEach((value, index) => instance.stiffnesses[index] = value)
                            newLinearDensities.forEach((value, index) => instance.linearDensities[index] = value)
                            return
                        }
                        if (prefs && prefs.adoptLengths) {
                            this.fabric.instance.engine.adoptLengths()
                            this.save()
                            return
                        } else {
                            this.restore()
                            return
                        }
                }
                break
        }
        throw new Error(`No transition ${Stage[this._stage]} to ${Stage[stage]}`)
    }

    private save(): void {
        this.fabric.instance.engine.cloneInstance(this.fabric.instance.index, this.fabric.slackInstance.index)
    }

    private restore(): void {
        this.fabric.instance.engine.cloneInstance(this.fabric.slackInstance.index, this.fabric.instance.index)
        const floatFeatures = this.fabric.floatFeatures
        Object.keys(floatFeatures)
            .map(k => floatFeatures[k] as FloatFeature)
            .forEach(feature => this.fabric.instance.applyFeature(feature))
    }
}

export function stiffnessToLinearDensity(stiffness: number): number {
    return Math.sqrt(stiffness)
}

function adjustedStiffness(fabric: TensegrityFabric): {
    newStiffnesses: Float32Array,
    newLinearDensities: Float32Array,
} {
    const pushOverPull = fabric.featureValues[FabricFeature.PushOverPull].numeric
    const strains: Float32Array = fabric.instance.strains
    const existingStiffnesses = fabric.instance.stiffnesses
    const getAverageStrain = (toAverage: IInterval[]) => {
        const totalStrain = toAverage.reduce((sum, interval) => sum + strains[interval.index], 0)
        return totalStrain / toAverage.length
    }
    const intervals = fabric.intervals
    const pushes = intervals.filter(interval => interval.isPush)
    const averagePushStrain = getAverageStrain(pushes)
    const pulls = intervals.filter(interval => !interval.isPush)
    const averagePullStrain = getAverageStrain(pulls)
    const averageAbsoluteStrain = (-pushOverPull * averagePushStrain + averagePullStrain) / 2
    const changes = intervals.map(interval => {
        const absoluteStrain = strains[interval.index] * (interval.isPush ? -pushOverPull : 1)
        const normalizedStrain = absoluteStrain - averageAbsoluteStrain
        const strainFactor = normalizedStrain / averageAbsoluteStrain
        return 1 + strainFactor
    })
    const stiffness = existingStiffnesses.map((value, index) => value * changes[index])
    const linearDensities = stiffness.map(stiffnessToLinearDensity)
    return {newStiffnesses: stiffness, newLinearDensities: linearDensities}
}
