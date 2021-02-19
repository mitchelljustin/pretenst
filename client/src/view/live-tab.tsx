/*
 * Copyright (c) 2019. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import { Stage } from "eig"
import * as React from "react"
import { useEffect, useState } from "react"
import { FaCompressArrowsAlt, FaHandRock, FaParachuteBox } from "react-icons/all"
import { Button, ButtonGroup } from "reactstrap"

import { Tensegrity } from "../fabric/tensegrity"
import { FEATURE_VALUES } from "../storage/recoil"

import { Grouping } from "./control-tabs"
import { FeatureSlider } from "./feature-slider"

export function LiveTab({tensegrity}: { tensegrity: Tensegrity }): JSX.Element {
    const [stage, updateStage] = useState(tensegrity.stage$.getValue())
    useEffect(() => {
        const sub = tensegrity.stage$.subscribe(updateStage)
        return () => sub.unsubscribe()
    }, [tensegrity])
    return (
        <div>
            {stage < Stage.Slack ? (
                <Grouping>
                    <ButtonGroup className="w-100 my-3">
                        <Button disabled={stage !== Stage.Shaping}
                                onClick={() => tensegrity.fabric.centralize()}>
                            <FaCompressArrowsAlt/> Centralize
                        </Button>
                    </ButtonGroup>
                </Grouping>
            ) : stage > Stage.Slack ? (
                <Grouping>
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
            <Grouping>{
                FEATURE_VALUES.map((featureValue, index) => (
                    <div key={`fv-${index}`} className="my-1">
                        <FeatureSlider
                            featureValue={featureValue}
                            apply={(feature, percent, value) => {
                                tensegrity.instance.applyFeature(feature, percent, value)
                            }}
                        />
                    </div>
                ))
            }</Grouping>
        </div>
    )
}

