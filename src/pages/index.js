import { useState, useEffect, useRef } from 'react';
import { Canvas, useLoader, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';

// Conversion lat/lon → coord sphère 3D
function latLongToVector3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return [x, y, z];
}

// Conversion coord sphère 3D → lat/lon
function vector3ToLatLong(vector) {
  const radius = vector.length();
  const lat = 90 - (Math.acos(vector.y / radius)) * (180 / Math.PI);
  const lon =
    ((Math.atan2(vector.z, vector.x) * 180) / Math.PI - 180) * -1; // ajustement

  return { lat, lon };
}

// API Nominatim reverse geocoding
async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'My3DGlobeApp/1.0 (contact@example.com)',
      },
    });
    if (!response.ok) throw new Error('Network error');
    const data = await response.json();
    return data.display_name || "Lieu inconnu";
  } catch {
    return "Lieu inconnu";
  }
}

// Composant POI cliquable avec animation, label visible uniquement si pas caché par la Terre
function POI({ name, lat, lon, radius, onClick, earthRef }) {
  const meshRef = useRef();
  const [hovered, setHovered] = useState(false);
  const { camera } = useThree();

  const position = latLongToVector3(lat, lon, radius + 0.05);

  // Pulse animation
  useFrame(({ clock }) => {
    const s = 1 + 0.3 * Math.sin(clock.getElapsedTime() * 3);
    if (meshRef.current) meshRef.current.scale.set(s, s, s);
  });

  // Visibilité label selon obstruction par la Terre
  const [showLabel, setShowLabel] = useState(true);

  useFrame(() => {
    if (!earthRef.current) return;

    const origin = camera.position.clone();
    const direction = new THREE.Vector3(...position).sub(origin).normalize();

    const raycaster = new THREE.Raycaster(origin, direction);
    const intersects = raycaster.intersectObject(earthRef.current);

    if (intersects.length > 0) {
      const distanceToPOI = origin.distanceTo(new THREE.Vector3(...position));
      const distanceToEarth = intersects[0].distance;
      setShowLabel(distanceToPOI < distanceToEarth);
    } else {
      setShowLabel(true);
    }
  });

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={() => onClick({ name, lat, lon })}
        castShadow
      >
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshStandardMaterial color={hovered ? 'orange' : 'red'} />
      </mesh>
      {showLabel && (
        <Html
          position={[0, 0.1, 0]}
          style={{
            color: hovered ? 'orange' : 'white',
            fontWeight: 'bold',
            userSelect: 'none',
            pointerEvents: 'none',
            fontSize: '12px',
            whiteSpace: 'nowrap',
            textShadow: '0 0 3px black',
          }}
          center
        >
          {name}
        </Html>
      )}
    </group>
  );
}

// Globe Terre avec rotation automatique et POI + détection clic global
function Earth({ capitals, onPOIClick, onGlobeClick }) {
  const texture = useLoader(THREE.TextureLoader, '/textures/earth.png');
  const radius = 2;
  const earthRef = useRef();
  const { camera, gl } = useThree();

  // Rotation automatique
  useFrame(({ clock }) => {
    if (earthRef.current) {
      earthRef.current.rotation.y = clock.getElapsedTime() * 0.1;
    }
  });

  // Gestion clic sur globe (pas sur POI)
  useEffect(() => {
    async function handleClick(event) {
      const rect = gl.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      const mouse = new THREE.Vector2(x, y);
      const raycaster = new THREE.Raycaster();

      raycaster.setFromCamera(mouse, camera);

      if (!earthRef.current) return;

      const intersects = raycaster.intersectObject(earthRef.current);
      if (intersects.length > 0) {
        const point = intersects[0].point;
        const { lat, lon } = vector3ToLatLong(point);

        // Appel API pour nom lieu
        const name = await reverseGeocode(lat, lon);

        onGlobeClick({ name, lat, lon });
      }
    }

    gl.domElement.addEventListener('click', handleClick);
    return () => {
      gl.domElement.removeEventListener('click', handleClick);
    };
  }, [camera, gl, onGlobeClick]);

  return (
    <group ref={earthRef}>
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[radius, 64, 64]} />
        <meshStandardMaterial map={texture} />
      </mesh>

      {capitals.map(({ name, lat, lon }) => (
        <POI
          key={name}
          name={name}
          lat={lat}
          lon={lon}
          radius={radius}
          onClick={onPOIClick}
          earthRef={earthRef}
        />
      ))}
    </group>
  );
}

// Modale stylée avec animation d'ouverture et fermeture fluide via framer-motion
function Modal({ city, onClose }) {
  return (
    <AnimatePresence>
      {city && (
        <>
          <motion.div
            style={overlayStyle}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            style={modalStyle}
            initial={{ opacity: 0, scale: 0.8, y: "-60%" }}
            animate={{ opacity: 1, scale: 1, y: "-50%" }}
            exit={{ opacity: 0, scale: 0.8, y: "-60%" }}
            transition={{ duration: 0.3 }}
          >
            <h2>{city.name}</h2>
            <p>Latitude: {city.lat.toFixed(4)}</p>
            <p>Longitude: {city.lon.toFixed(4)}</p>
            <button onClick={onClose} style={buttonStyle}>
              Fermer
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

const overlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.5)',
  zIndex: 10,
};

const modalStyle = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  backgroundColor: 'white',
  padding: '1.5rem 2rem',
  borderRadius: '10px',
  boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
  zIndex: 11,
  maxWidth: '300px',
  textAlign: 'center',
  transformOrigin: 'center',
};

const buttonStyle = {
  marginTop: '1rem',
  padding: '0.5rem 1rem',
  cursor: 'pointer',
  borderRadius: '5px',
  border: 'none',
  backgroundColor: '#0070f3',
  color: 'white',
  fontWeight: 'bold',
};

export default function Home() {
  const [capitals, setCapitals] = useState([]);
  const [selectedCity, setSelectedCity] = useState(null);

  // Charger capitals.json au montage
  useEffect(() => {
    fetch('/capitals.json')
      .then((r) => r.json())
      .then(setCapitals);
  }, []);

  function handlePOIClick(city) {
    setSelectedCity(city);
  }

  function handleGlobeClick(city) {
    setSelectedCity(city);
  }

  function closeModal() {
    setSelectedCity(null);
  }

  return (
    <>
      <Canvas
        shadows
        camera={{ position: [0, 0, 6], fov: 45 }}
        style={{ height: '100vh', backgroundColor: '#020916' }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[5, 3, 5]}
          intensity={1}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <Earth
          capitals={capitals}
          onPOIClick={handlePOIClick}
          onGlobeClick={handleGlobeClick}
        />
        <OrbitControls enableZoom={true} />
      </Canvas>

      <Modal city={selectedCity} onClose={closeModal} />
    </>
  );
}
