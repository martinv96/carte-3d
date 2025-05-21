// components/WorldMap.js
import { useGLTF } from '@react-three/drei'

export default function WorldMap(props) {
  const { scene } = useGLTF('/models/world.glb')
  return <primitive object={scene} {...props} />
}
