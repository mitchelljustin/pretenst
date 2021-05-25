/*
 * Copyright (c) 2021. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import { OrbitControls, Stars } from "@react-three/drei"
import * as React from "react"
import { useState } from "react"
import { useFrame } from "react-three-fiber"
import { useRecoilState } from "recoil"
import { Color, CylinderGeometry, Euler, Material, MeshLambertMaterial, Quaternion, Vector3 } from "three"

import { isPushRole, UP } from "../fabric/eig-util"
import { Tensegrity } from "../fabric/tensegrity"
import { IInterval, intervalsAdjacent } from "../fabric/tensegrity-types"
import { ViewMode, viewModeAtom } from "../storage/recoil"
import { LINE_VERTEX_COLORS } from "../view/materials"
import { SurfaceComponent } from "../view/surface-component"

export function ObjectView({tensegrity, selected, setSelected}: {
    tensegrity: Tensegrity,
    selected: IInterval | undefined,
    setSelected: (selection: IInterval | undefined) => void,
}): JSX.Element {
    const [viewMode] = useRecoilState(viewModeAtom)
    const [target, setTarget] = useState(new Vector3())
    useFrame(() => {
        if (viewMode === ViewMode.Lines) {
            tensegrity.iterate()
        }
        const toMidpoint = new Vector3().subVectors(tensegrity.instance.midpoint, target).multiplyScalar(0.1)
        setTarget(new Vector3().copy(target).add(toMidpoint))
    })
    const instance = tensegrity.instance
    const Rendering = () => {
        switch (viewMode) {
            case ViewMode.Lines:
                return (
                    <lineSegments
                        key="lines"
                        geometry={tensegrity.instance.floatView.lineGeometry}
                        material={LINE_VERTEX_COLORS}
                        onUpdate={self => self.geometry.computeBoundingSphere()}
                    />
                )
            case ViewMode.Selecting:
                return (
                    <SelectingView
                        tensegrity={tensegrity}
                        selected={selected}
                        setSelected={setSelected}
                    />
                )
            case ViewMode.Frozen:
                return (
                    <group>
                        {tensegrity.intervals.map((interval: IInterval) => {
                            const isPush = isPushRole(interval.intervalRole)
                            const unit = instance.unitVector(interval.index)
                            const rotation = new Quaternion().setFromUnitVectors(UP, unit)
                            const length = instance.jointDistance(interval.alpha, interval.omega)
                            const radius = isPush ? PUSH_RADIUS : PULL_RADIUS
                            const intervalScale = new Vector3(radius, length, radius)
                            return (
                                <mesh
                                    key={`T${interval.index}`}
                                    geometry={CYLINDER}
                                    position={instance.intervalLocation(interval)}
                                    rotation={new Euler().setFromQuaternion(rotation)}
                                    scale={intervalScale}
                                    material={isPush ? PUSH_MATERIAL : PULL_MATERIAL}
                                    matrixWorldNeedsUpdate={true}
                                />
                            )
                        })}}
                    </group>
                )
        }
    }
    return (
        <group>
            <OrbitControls onPointerMissed={undefined} target={target}/>
            <scene>
                <Rendering/>
                <SurfaceComponent/>
                <Stars/>
                <ambientLight color={new Color("white")} intensity={0.8}/>
                <directionalLight color={new Color("#FFFFFF")} intensity={2}/>
            </scene>
        </group>
    )
}

function SelectingView({tensegrity, selected, setSelected}: {
    tensegrity: Tensegrity,
    selected: IInterval | undefined,
    setSelected: (interval?: IInterval) => void,
}): JSX.Element {
    const instance = tensegrity.instance
    const clickInterval = (interval: IInterval) => {
        setSelected(interval)
        console.log("click!", interval.index)
    }
    return (
        <group>
            {tensegrity.intervals.map((interval: IInterval) => {
                const isPush = isPushRole(interval.intervalRole)
                if (!isPush) {
                    if (selected) {
                        if (isPushRole(selected.intervalRole)) {
                            if (!intervalsAdjacent(selected, interval)) {
                                return undefined
                            }
                        } else {
                            if (selected.index !== interval.index) {
                                return undefined
                            }
                        }
                        if (!intervalsAdjacent(selected, interval)) {
                            return undefined
                        }
                    } else {
                        return undefined
                    }
                }
                const unit = instance.unitVector(interval.index)
                const rotation = new Quaternion().setFromUnitVectors(UP, unit)
                const length = instance.jointDistance(interval.alpha, interval.omega)
                const radius = isPush ? PUSH_RADIUS : PULL_RADIUS
                const intervalScale = new Vector3(radius, length, radius)
                return (
                    <mesh
                        key={`T${interval.index}`}
                        geometry={CYLINDER}
                        position={instance.intervalLocation(interval)}
                        rotation={new Euler().setFromQuaternion(rotation)}
                        scale={intervalScale}
                        material={selected && selected.index === interval.index ? SELECTED_MATERIAL : isPush ? PUSH_MATERIAL : PULL_MATERIAL}
                        matrixWorldNeedsUpdate={true}
                        onPointerDown={event => {
                            event.stopPropagation()
                            clickInterval(interval)
                        }}
                    />
                )
            })}}
        </group>
    )
}

function material(colorString: string): Material {
    const color = new Color(colorString)
    return new MeshLambertMaterial({color})
}

const SELECTED_MATERIAL = material("#ffdd00")
const PUSH_MATERIAL = material("#384780")
const PULL_MATERIAL = material("#a80000")

const BASE_RADIUS = 8
const PUSH_RADIUS = 0.004 * BASE_RADIUS
const PULL_RADIUS = 0.002 * BASE_RADIUS
const CYLINDER = new CylinderGeometry(1, 1, 1, 12, 1, false)

