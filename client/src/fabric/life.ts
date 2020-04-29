/*
 * Copyright (c) 2019. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import { IntervalRole, Stage, WorldFeature } from "eig"
import { Matrix4 } from "three"

import { Tensegrity } from "./tensegrity"
import { TensegrityOptimizer } from "./tensegrity-optimizer"

export interface ILifeTransition {
    stage: Stage
    strainToStiffness?: boolean
    adoptLengths?: boolean
}

export class Life {
    private _stage: Stage

    constructor(private numericFeature: (worldFeature: WorldFeature) => number, private tensegrity: Tensegrity, stage: Stage) {
        this._stage = stage
    }

    public executeTransition(tx: ILifeTransition): Life {
        this.transition(tx)
        this._stage = tx.stage
        return new Life(this.numericFeature, this.tensegrity, tx.stage)
    }

    public get stage(): Stage {
        return this._stage
    }

    private transition({stage, adoptLengths, strainToStiffness}: ILifeTransition): void {
        const tensegrity = this.tensegrity
        switch (this._stage) {
            case Stage.Growing:
                switch (stage) {
                    case Stage.Shaping:
                        return
                }
                break
            case Stage.Shaping:
                switch (stage) {
                    case Stage.Slack:
                        if (adoptLengths) {
                            tensegrity.fabric.adopt_lengths()
                            if (tensegrity.faceAnchors.length > 0) {
                                tensegrity.instance.apply(new Matrix4().setPosition(0, -0.01, 0))
                            }
                            const faceIntervals = [...tensegrity.faceIntervals]
                            faceIntervals.forEach(interval => tensegrity.removeFaceInterval(interval))
                            const faceAnchors = [...tensegrity.faceAnchors]
                            faceAnchors.forEach(interval => tensegrity.removeFaceAnchor(interval))
                            tensegrity.instance.snapshot()
                        }
                        return
                    case Stage.Pretensing:
                        return
                }
                break
            case Stage.Slack:
                switch (stage) {
                    case Stage.Shaping:
                        return
                    case Stage.Pretensing:
                        return
                }
                break
            case Stage.Pretensing:
                switch (stage) {
                    case Stage.Pretenst:
                        return
                }
                break
            case Stage.Pretenst:
                switch (stage) {
                    case Stage.Slack:
                        if (strainToStiffness) {
                            new TensegrityOptimizer(tensegrity).stiffnessesFromStrains(interval => {
                                switch (interval.intervalRole) {
                                    case IntervalRole.RibbonPush:
                                    case IntervalRole.RibbonShort:
                                    case IntervalRole.RibbonLong:
                                    case IntervalRole.RibbonHanger:
                                        return false
                                    default:
                                        const alphaY = interval.alpha.location().y
                                        const omegaY = interval.omega.location().y
                                        const surface = (alphaY + omegaY) < 0.1
                                        return !surface
                                }
                            })
                            return
                        }
                        if (adoptLengths) {
                            tensegrity.fabric.adopt_lengths()
                            tensegrity.instance.snapshot()
                            return
                        }
                }
                break
        }
        throw new Error(`No transition ${Stage[this._stage]} to ${Stage[stage]}`)
    }
}

