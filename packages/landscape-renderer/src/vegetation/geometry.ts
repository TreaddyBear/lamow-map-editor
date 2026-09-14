import { Matrix, Quaternion, Vector3 } from "@babylonjs/core";

export type Axes = {
  x: Vector3;
  y: Vector3;
  z: Vector3;
};

export type Pose = {
  position: Vector3;
  rotation: Quaternion;
  axes: Axes;
};

const upAxis = new Vector3(0, 1, 0);
const forwardAxis = new Vector3(0, 0, 1);
const rightAxis = new Vector3(1, 0, 0);

export function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function stemGrowthVector(height: number, arcDegrees: number, arcAzimuthDegrees: number) {
  // An ideal of 180° with ±180° variation can legitimately sample 360°.
  // Trigonometry handles those turns; clamping created a pile-up at ±180°.
  const arc = degreesToRadians(arcDegrees);
  const azimuth = degreesToRadians(arcAzimuthDegrees);
  const radial = Math.sin(arc) * height;
  return new Vector3(Math.cos(azimuth) * radial, Math.cos(arc) * height, Math.sin(azimuth) * radial);
}

export function stemOrientationQuaternion(vector: Vector3) {
  const direction = normalizedOr(vector, upAxis);
  const rotation = new Quaternion();
  Quaternion.FromUnitVectorsToRef(upAxis, direction, rotation);
  return rotation;
}

export function stemOrientationMatrix(vector: Vector3) {
  const rotation = stemOrientationQuaternion(vector);
  const matrix = Matrix.Identity();
  Matrix.FromQuaternionToRef(rotation, matrix);
  return matrix;
}

export function rotateYVector(x: number, y: number, z: number, yawRadians: number) {
  const cos = Math.cos(yawRadians);
  const sin = Math.sin(yawRadians);
  return new Vector3((x * cos) + (z * sin), y, (z * cos) - (x * sin));
}

export function petalRadialDirection(thetaRadians: number) {
  return new Vector3(Math.sin(thetaRadians), 0, Math.cos(thetaRadians));
}

export function petalAxes(thetaRadians: number, petalPitchRadians: number): Axes {
  const radial = petalRadialDirection(thetaRadians);
  const elevation = -petalPitchRadians;
  const zAxis = normalizedOr(new Vector3(
    radial.x * Math.cos(elevation),
    Math.sin(elevation),
    radial.z * Math.cos(elevation),
  ), forwardAxis);
  const tangent = normalizedOr(new Vector3(Math.cos(thetaRadians), 0, -Math.sin(thetaRadians)), rightAxis);
  const yAxis = normalizedOr(Vector3.Cross(zAxis, tangent), upAxis);
  const xAxis = normalizedOr(Vector3.Cross(yAxis, zAxis), tangent);
  return { x: xAxis, y: yAxis, z: zAxis };
}

export function petalPose(headPosition: Vector3, thetaRadians: number, baseRadius: number, petalPitchRadians: number): Pose {
  const radial = petalRadialDirection(thetaRadians);
  const axes = petalAxes(thetaRadians, petalPitchRadians);
  return {
    position: new Vector3(
      headPosition.x + (radial.x * baseRadius),
      headPosition.y,
      headPosition.z + (radial.z * baseRadius),
    ),
    rotation: quaternionFromAxes(axes),
    axes,
  };
}

export function composePetalMatrix(headPosition: Vector3, thetaRadians: number, baseRadius: number, petalPitchRadians: number, scale: Vector3) {
  const pose = petalPose(headPosition, thetaRadians, baseRadius, petalPitchRadians);
  return Matrix.Compose(scale, pose.rotation, pose.position);
}

export function composeStemMatrix(rootPosition: Vector3, stemVector: Vector3, scale: Vector3) {
  return Matrix.Compose(scale, stemOrientationQuaternion(stemVector), rootPosition);
}

export function quaternionFromAxes(axes: Axes) {
  const matrix = Matrix.Identity();
  Matrix.FromXYZAxesToRef(axes.x, axes.y, axes.z, matrix);
  const rotation = new Quaternion();
  Quaternion.FromRotationMatrixToRef(matrix, rotation);
  return rotation;
}

export function normalizedOr(vector: Vector3, fallback: Vector3) {
  return vector.lengthSquared() > 0.000001 ? vector.normalizeToNew() : fallback.clone();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
