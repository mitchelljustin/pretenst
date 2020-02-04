/*
 * Copyright (c) 2020. Beautiful Code BV, Rotterdam, Netherlands
 * Licensed under GNU GENERAL PUBLIC LICENSE Version 3.
 */
use nalgebra::*;
use crate::*;
use joint::Joint;
use constants::RAINBOW;

pub struct Interval {
    alpha_index: usize,
    omega_index: usize,
    pub(crate) interval_role: IntervalRole,
    pub(crate) rest_length: f32,
    state_length: [f32; 2],
    pub(crate) stiffness: f32,
    pub(crate) linear_density: f32,
    pub(crate) countdown: u16,
    max_countdown: u16,
    unit: Vector3<f32>,
    pub(crate) strain: f32,
}

impl Interval {
    pub fn new(alpha_index: usize, omega_index: usize, interval_role: IntervalRole,
               rest_length: f32, stiffness: f32, linear_density: f32, countdown: u16) -> Interval {
        Interval {
            alpha_index,
            omega_index,
            interval_role,
            rest_length,
            state_length: [1.0; 2],
            stiffness,
            linear_density,
            countdown,
            max_countdown: countdown,
            unit: zero(),
            strain: 0.0,
        }
    }

    pub fn alpha<'a>(&self, joints: &'a Vec<Joint>) -> &'a Joint {
        &joints[self.alpha_index]
    }

    pub fn omega<'a>(&self, joints: &'a Vec<Joint>) -> &'a Joint {
        &joints[self.omega_index]
    }

    pub fn physics(&mut self, joints: &mut Vec<Joint>, stage: Stage, environment: &Environment, realizing_nuance: f32) {
        let mut ideal_length = self.ideal_length_now();
        let omega_location = &joints[self.omega_index].location;
        let alpha_location = &joints[self.alpha_index].location;
        self.unit = omega_location - alpha_location;
        let real_length = self.unit.norm();
        let push = self.is_push();
        if push {
            match stage {
                Stage::Busy | Stage::Slack => {}
                Stage::Growing | Stage::Shaping => {
                    ideal_length *= 1.0 + environment.get_float_feature(FabricFeature::ShapingPretenstFactor);
                }
                Stage::Realizing => {
                    ideal_length *= 1.0 + environment.get_float_feature(FabricFeature::PretenstFactor) * realizing_nuance
                }
                Stage::Realized => {
                    ideal_length *= 1.0 + environment.get_float_feature(FabricFeature::PretenstFactor)
                }
            }
        }
        self.strain = (real_length - ideal_length) / ideal_length;
        if !environment.push_and_pull && (push && self.strain > 0.0 || !push && self.strain < 0.0) {
            self.strain = 0.0;
        }
        let mut force = self.strain * self.stiffness;
        if stage <= Stage::Slack {
            force *= environment.get_float_feature(FabricFeature::ShapingStiffnessFactor)
        }
        let mut push: Vector3<f32> = zero();
        push += &self.unit;
        if self.interval_role == IntervalRole::FacePull {
            push *= force / 6.0;
            // TODO
            joints[self.alpha_index].force += &push;
            joints[self.omega_index].force -= &push;
        } else {
            push *= force / 2.0;
            joints[self.alpha_index].force += &push;
            joints[self.omega_index].force -= &push;
            let half_mass = ideal_length * self.linear_density / 2.0;
            joints[self.alpha_index].interval_mass += half_mass;
            joints[self.omega_index].interval_mass += half_mass;
        }
    }

    pub fn is_push(&self) -> bool {
        self.interval_role == IntervalRole::NexusPush || self.interval_role == IntervalRole::ColumnPush
    }

    fn ideal_length_now(&mut self) -> f32 {
        if self.countdown == 0 {
            self.rest_length
        } else {
            let max = self.max_countdown as f32;
            let progress: f32 = (max - self.countdown as f32) / max;
            let state_length = self.state_length[0];
            self.rest_length * (1.0 - progress) + state_length * progress
        }
    }

    fn change_rest_length(&mut self, rest_length: f32, countdown: u16) {
        self.rest_length = self.state_length[0];
        self.state_length[0] = rest_length;
        self.max_countdown = countdown;
        self.countdown = countdown;
    }

    pub fn multiply_rest_length(&mut self, factor: f32, countdown: u16) {
        let rest_length = self.state_length[0];
        self.change_rest_length(rest_length * factor, countdown)
    }

    pub fn set_line_locations<'a>(&self, line_locations: &mut Vec<f32>, offset: usize, joints: &'a Vec<Joint>, extend: f32) {
        let alpha = &self.alpha(joints).location;
        let omega = &self.omega(joints).location;
        line_locations[offset] = alpha.x - self.unit.x * extend;
        line_locations[offset + 1] = alpha.y - self.unit.y * extend;
        line_locations[offset + 2] = alpha.z - self.unit.z * extend;
        line_locations[offset + 3] = omega.x + self.unit.x * extend;
        line_locations[offset + 4] = omega.y + self.unit.y * extend;
        line_locations[offset + 5] = omega.z + self.unit.z * extend;
    }

    pub fn set_line_color(&self, line_colors: &mut Vec<f32>, offset: usize, color: [f32; 3]) {
        line_colors[offset] = color[0];
        line_colors[offset + 1] = color[1];
        line_colors[offset + 2] = color[2];
        line_colors[offset + 3] = color[0];
        line_colors[offset + 4] = color[1];
        line_colors[offset + 5] = color[2];
    }

    pub fn set_line_color_nuance(&self, line_colors: &mut Vec<f32>, offset: usize, nuance: f32) {
        let rainbow_index = (nuance * RAINBOW.len() as f32 / 3.01).floor() as usize;
        self.set_line_color(line_colors, offset, RAINBOW[rainbow_index])
    }
}

