// Three.js 本体と、このゲームで使う追加機能を1つのファイルにまとめるための入口。
// 作り方は tools/README.md を参照（esbuild で vendor/three-bundle.min.js を生成する）。
import * as THREE_NS from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

window.THREE = Object.assign({}, THREE_NS, {
  GLTFLoader, RoomEnvironment, EffectComposer, RenderPass, UnrealBloomPass, BokehPass, GTAOPass,
  OutputPass, ShaderPass, Sky, RoundedBoxGeometry, BufferGeometryUtils, SkeletonUtils,
});
