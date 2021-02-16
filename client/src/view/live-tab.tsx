/*
 * Copyright (c) 2019. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import { Stage, WorldFeature } from "eig"
import * as React from "react"
import { useEffect, useState } from "react"
import { FaCompressArrowsAlt, FaHandRock, FaParachuteBox } from "react-icons/all"
import { Button, ButtonGroup } from "reactstrap"

import { Tensegrity } from "../fabric/tensegrity"

import { Grouping } from "./control-tabs"
import { FeaturePanel } from "./feature-panel"

export function LiveTab({tensegrity}: { tensegrity: Tensegrity }): JSX.Element {
    const [stage, updateStage] = useState(tensegrity.stage$.getValue())
    useEffect(() => {
        const sub = tensegrity.stage$.subscribe(updateStage)
        return () => sub.unsubscribe()
    }, [tensegrity])
    return (
        <div>
            <Grouping>
                <FeaturePanel feature={WorldFeature.IterationsPerFrame}/>
                <FeaturePanel feature={WorldFeature.IntervalCountdown}/>
                <FeaturePanel feature={WorldFeature.PushOverPull}/>
            </Grouping>
            {stage < Stage.Slack ? (
                <Grouping>
                    <FeaturePanel feature={WorldFeature.ShapingPretenstFactor}/>
                    <FeaturePanel feature={WorldFeature.ShapingDrag}/>
                    <FeaturePanel feature={WorldFeature.ShapingStiffnessFactor}/>
                    <ButtonGroup className="w-100 my-3">
                        <Button disabled={stage !== Stage.Shaping}
                                onClick={() => tensegrity.fabric.centralize()}>
                            <FaCompressArrowsAlt/> Centralize
                        </Button>
                    </ButtonGroup>
                </Grouping>
            ) : stage > Stage.Slack ? (
                <Grouping>
                    <FeaturePanel feature={WorldFeature.PretenstFactor}/>
                    <FeaturePanel feature={WorldFeature.StiffnessFactor}/>
                    <FeaturePanel feature={WorldFeature.Gravity}/>
                    <FeaturePanel feature={WorldFeature.Drag}/>
                    <ButtonGroup className="w-100 my-3">
                        <Button disabled={stage !== Stage.Pretenst}
                                onClick={() => tensegrity.fabric.set_altitude(1)}>
                            <FaHandRock/> Nudge
                        </Button>
                        <Button disabled={stage !== Stage.Pretenst}
                                onClick={() => tensegrity.fabric.set_altitude(10)}>
                            <FaParachuteBox/> Drop
                        </Button>
                    </ButtonGroup>
                </Grouping>
            ) : undefined}
        </div>
    )
}

