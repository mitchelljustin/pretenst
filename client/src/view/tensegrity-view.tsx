/*
 * Copyright (c) 2019. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import * as React from "react"
import { useEffect, useState } from "react"
import { Canvas, extend, ReactThreeFiber } from "react-three-fiber"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls"

import { IFabricEngine } from "../fabric/fabric-engine"
import { IFeature } from "../fabric/features"
import { ISelection } from "../fabric/tensegrity-brick-types"
import { TensegrityFabric } from "../fabric/tensegrity-fabric"
import { loadFabricCode, loadStorageIndex } from "../storage/local-storage"

import { FabricView } from "./fabric-view"
import { TensegrityControl } from "./tensegrity-control"

extend({OrbitControls})

declare global {
    namespace JSX {
        /* eslint-disable @typescript-eslint/interface-name-prefix */
        interface IntrinsicElements {
            orbitControls: ReactThreeFiber.Object3DNode<OrbitControls, typeof OrbitControls>
        }

        /* eslint-enable @typescript-eslint/interface-name-prefix */
    }
}

const ALTITUDE = 6

export function TensegrityView({engine, getFabric, physicsFeatures, roleFeatures}: {
    engine: IFabricEngine,
    getFabric: (name: string) => TensegrityFabric,
    physicsFeatures: IFeature[],
    roleFeatures: IFeature[],
}): JSX.Element {

    // const [open, setOpen] = useState<boolean>(false) todo maybe

    const [fabric, setFabric] = useState<TensegrityFabric | undefined>()
    const [selection, setSelection] = useState<ISelection>({})

    useEffect(() => {
        if (!fabric) {
            const code = loadFabricCode()[loadStorageIndex()]
            const fetched = getFabric(code)
            fetched.startConstruction(code, ALTITUDE)
            setFabric(fetched)
        }
    })

    function constructFabric(code: string): void {
        setSelection({})
        if (fabric) {
            fabric.startConstruction(code, ALTITUDE)
        } else {
            const fetched = getFabric(code)
            fetched.startConstruction(code, ALTITUDE)
            setFabric(fetched)
        }
    }

    return (
        <div className="the-whole-page">
            <div className="left-panel">
                <TensegrityControl
                    engine={engine}
                    physicsFeatures={physicsFeatures}
                    roleFeatures={roleFeatures}
                    fabric={fabric}
                    constructFabric={constructFabric}
                    selection={selection}
                    setSelection={setSelection}
                />
            </div>
            <div id="tensegrity-view" className="middle-panel">
                <Canvas>
                    {!fabric ? undefined :
                        <FabricView fabric={fabric} selection={selection} setSelection={setSelection}/>}
                </Canvas>
            </div>
        </div>
    )
}

