/*
 * Copyright (c) 2019. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */

import * as FileSaver from "file-saver"
import JSZip from "jszip"

import { IJointHole } from "../fabric/tensegrity-types"

function csvNumber(n: number): string {
    return n.toFixed(5).replace(/[.]/, ",")
}

function dateString(): string {
    return new Date().toISOString()
        .replace(/[.].*/, "").replace(/[:T_]/g, "-")
}

export interface IOutputJoint {
    index: number
    x: number
    y: number
    z: number
    radius: number
    holes: IJointHole[]
}

export interface IOutputInterval {
    index: number
    joints: number[]
    type: string
    strain: number
    stiffness: number
    linearDensity: number
    isPush: boolean
    role: string
    scale: number
    idealLength: number
    length: number
    radius: number
}

export interface IFabricOutput {
    name: string
    joints: IOutputJoint[]
    intervals: IOutputInterval[]
}

function extractJointFile(output: IFabricOutput): string {
    const csvJoints: string[][] = []
    csvJoints.push(["index", "x", "y", "z"])
    output.joints.forEach(joint => csvJoints.push([
        (joint.index+1).toFixed(0),
        csvNumber(joint.x), csvNumber(joint.y), csvNumber(joint.z),
    ]))
    return csvJoints.map(a => a.join(";")).join("\n")
}

function extractIntervalFile(output: IFabricOutput): string {
    const csvIntervals: string[][] = []
    csvIntervals.push(["joints", "type", "strain", "stiffness", "linear density", "role", "length"])
    output.intervals.forEach(interval => {
        csvIntervals.push([
            `"=""${interval.joints.map(j => (j + 1).toFixed(0))}"""`, interval.type,
            csvNumber(interval.strain), csvNumber(interval.stiffness), csvNumber(interval.linearDensity),
            interval.role, interval.length.toFixed(8),
        ])
    })
    return csvIntervals.map(a => a.join(";")).join("\n")
}

function extractSubmergedFile(output: IFabricOutput): string {
    const csvSubmerged: string[][] = []
    csvSubmerged.push(["joints"])
    // TODO: submerged
    // csvSubmerged.push([`"=""${output.joints.filter(({anchor})=> anchor).map(joint => joint.index + 1)}"""`])
    return csvSubmerged.map(a => a.join(";")).join("\n")
}

export function saveCSVZip(output: IFabricOutput): void {
    const zip = new JSZip()
    zip.file("joints.csv", extractJointFile(output))
    zip.file("intervals.csv", extractIntervalFile(output))
    zip.file("submerged.csv", extractSubmergedFile(output))
    zip.generateAsync({type: "blob", mimeType: "application/zip"}).then(blob => {
        FileSaver.saveAs(blob, `pretenst-${dateString()}.zip`)
    })
}

export function saveJSONZip(output: IFabricOutput): void {
    const zip = new JSZip()
    zip.file(`pretenst-${dateString()}.json`, JSON.stringify(output, undefined, 2))
    zip.generateAsync({type: "blob", mimeType: "application/zip"}).then(blob => {
        FileSaver.saveAs(blob, `pretenst-${dateString()}.zip`)
    })
}
