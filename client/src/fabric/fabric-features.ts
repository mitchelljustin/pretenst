/*
 * Copyright (c) 2019. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 * something extra so it can compile
 */

import { BehaviorSubject, Subscription } from "rxjs"

import { FabricFeature, IntervalRole, roleToLengthFeature } from "./fabric-engine"

export enum FeatureMultiplier {
    OneThousand,
    One,
    Hundredths,
    Thousandths,
    Millionths,
    Billionths,
}

type FeatureAdjustment = (factor: number, up: boolean) => number

interface IFeatureConfig {
    feature: FabricFeature
    name: string
    defaultValue: number
    multiplier: FeatureMultiplier
    fixedDigits: number
    adjustment: FeatureAdjustment
}

function multiplierValue(multiplier: FeatureMultiplier): number {
    switch (multiplier) {
        case FeatureMultiplier.OneThousand:
            return 1 / 1000.0
        case FeatureMultiplier.One:
            return 1
        case FeatureMultiplier.Hundredths:
            return 100
        case FeatureMultiplier.Thousandths:
            return 1000
        case FeatureMultiplier.Millionths:
            return 1000000
        case FeatureMultiplier.Billionths:
            return 1000000000
        default:
            throw new Error("Bad multiplier")
    }
}

const byTenPercent: FeatureAdjustment = (factor: number, up: boolean) => factor * (up ? 1.1 : 1 / 1.1)
const byOnePercent: FeatureAdjustment = (factor: number, up: boolean) => factor * (up ? 1.01 : 1 / 1.01)
const plusOne: FeatureAdjustment = (factor: number, up: boolean) => up || factor > 1 ? factor + (up ? 1 : -1) : 1

const FEATURE_CONFIGS: IFeatureConfig[] = [
    {
        feature: FabricFeature.Gravity,
        name: "Gravity",
        defaultValue: 0.0000005,
        multiplier: FeatureMultiplier.Billionths,
        fixedDigits: 1,
        adjustment: byTenPercent,
    },
    {
        feature: FabricFeature.Drag,
        name: "Drag",
        defaultValue: 0.0001,
        multiplier: FeatureMultiplier.Billionths,
        fixedDigits: 1,
        adjustment: byTenPercent,
    },
    {
        feature: FabricFeature.PretenseFactor,
        name: "Pretense Factor",
        defaultValue: 0.01,
        multiplier: FeatureMultiplier.Hundredths,
        fixedDigits: 2,
        adjustment: byTenPercent,
    },
    {
        feature: FabricFeature.PushStrainFactor,
        name: "Push Strain Factor",
        defaultValue: 1,
        multiplier: FeatureMultiplier.One,
        fixedDigits: 3,
        adjustment: byTenPercent,
    },
    {
        feature: FabricFeature.PushPullDifferential,
        name: "Push/Pull Differential",
        defaultValue: 1,
        multiplier: FeatureMultiplier.One,
        fixedDigits: 3,
        adjustment: byTenPercent,
    },
    {
        feature: FabricFeature.TicksPerFrame,
        name: "Ticks per Frame",
        defaultValue: 100.0,
        multiplier: FeatureMultiplier.One,
        fixedDigits: 0,
        adjustment: plusOne,
    },
    {
        feature: FabricFeature.IntervalBusyTicks,
        name: "Busy Countdown",
        defaultValue: 500.0,
        multiplier: FeatureMultiplier.One,
        fixedDigits: 1,
        adjustment: byTenPercent,
    },
    {
        feature: FabricFeature.PretenseTicks,
        name: "Pretensing Countdown",
        defaultValue: 30000,
        multiplier: FeatureMultiplier.OneThousand,
        fixedDigits: 1,
        adjustment: byTenPercent,
    },
    {
        feature: FabricFeature.PretenseIntensity,
        name: "Pretensing Intensity",
        defaultValue: 1,
        multiplier: FeatureMultiplier.One,
        fixedDigits: 2,
        adjustment: byTenPercent,
    },
    {
        feature: FabricFeature.SlackThreshold,
        name: "Slack Threshold",
        defaultValue: 0.0001,
        multiplier: FeatureMultiplier.Millionths,
        fixedDigits: 1,
        adjustment: byTenPercent,
    },
    {
        feature: FabricFeature.RadiusFactor,
        name: "Radius Factor",
        defaultValue: 50,
        multiplier: FeatureMultiplier.One,
        fixedDigits: 1,
        adjustment: byTenPercent,
    },
    {
        feature: FabricFeature.MaxStiffness,
        name: "Max Stiffness",
        defaultValue: 0.0005,
        multiplier: FeatureMultiplier.Millionths,
        fixedDigits: 0,
        adjustment: byTenPercent,
    },
    {
        feature: FabricFeature.PushLength,
        name: "Push",
        defaultValue: 2 * 1.618,
        multiplier: FeatureMultiplier.One,
        fixedDigits: 3,
        adjustment: byOnePercent,
    },
    {
        feature: FabricFeature.TriangleLength,
        name: "Triangle",
        defaultValue: 2.123,
        multiplier: FeatureMultiplier.One,
        fixedDigits: 3,
        adjustment: byOnePercent,
    },
    {
        feature: FabricFeature.RingLength,
        name: "Ring",
        defaultValue: 1.440,
        multiplier: FeatureMultiplier.One,
        fixedDigits: 3,
        adjustment: byOnePercent,
    },
    {
        feature: FabricFeature.CrossLength,
        name: "Cross",
        defaultValue: 2.123,
        multiplier: FeatureMultiplier.One,
        fixedDigits: 3,
        adjustment: byOnePercent,
    },
    {
        feature: FabricFeature.BowMidLength,
        name: "BowMid",
        defaultValue: 0.8521,
        multiplier: FeatureMultiplier.One,
        fixedDigits: 3,
        adjustment: byOnePercent,
    },
    {
        feature: FabricFeature.BowEndLength,
        name: "BowEnd",
        defaultValue: 1.2,
        multiplier: FeatureMultiplier.One,
        fixedDigits: 3,
        adjustment: byOnePercent,
    },
]

export function fabricFeatureValue(fabricFeature: FabricFeature, defaultValue?: boolean): number {
    const config = FEATURE_CONFIGS[fabricFeature]
    if (defaultValue) {
        return config.defaultValue
    }
    const key = FabricFeature[fabricFeature]
    const value = localStorage.getItem(key)
    return value ? parseFloat(value) : config.defaultValue
}

export function roleDefaultLength(intervalRole: IntervalRole): number {
    return fabricFeatureValue(roleToLengthFeature(intervalRole))
}

export class FloatFeature {
    private factor$: BehaviorSubject<number>

    constructor(public readonly config: IFeatureConfig) {
        const initialValue = fabricFeatureValue(config.feature)
        this.factor$ = new BehaviorSubject<number>(initialValue)
        this.factor$.subscribe(newFactor => {
            const key = FabricFeature[this.config.feature]
            if (this.isAtDefault) {
                localStorage.removeItem(key)
            } else {
                localStorage.setItem(key, newFactor.toFixed(18))
            }
        })
    }

    public get title(): string {
        return this.config.name
    }

    public get factor(): number {
        return this.factor$.getValue()
    }

    public get formatted(): string {
        const scaledValue = this.factor * multiplierValue(this.config.multiplier)
        return scaledValue.toFixed(this.config.fixedDigits)
    }

    public onChange(change: () => void): Subscription {
        return this.factor$.subscribe(() => change())
    }

    public get fabricFeature(): FabricFeature {
        return this.config.feature
    }

    public setValue(value: number): void {
        this.factor$.next(value)
    }

    public adjustValue(up: boolean): void {
        this.factor$.next(this.config.adjustment(this.factor$.getValue(), up))
    }

    public reset(): void {
        this.factor$.next(this.config.defaultValue)
    }

    public get isAtDefault(): boolean {
        const defaultValue = this.config.defaultValue
        const overDefault = Math.abs(this.factor / defaultValue)
        const difference = Math.abs(overDefault - 1)
        return difference < 0.00001
    }
}

export function createFabricFeatures(): FloatFeature[] {
    return FEATURE_CONFIGS.map(config => new FloatFeature(config))
}
