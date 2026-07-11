const fs = require('fs');
const path = './components/PathTracerSandbox/hooks/usePathTracer.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  'FLOATS_PER_TRIANGLE,',
  `FLOATS_PER_TRIANGLE,
  FLOATS_PER_BVH_NODE,`
);

content = content.replace(
  `        const triangleData = serializeTriangles(scene);
        const triangleCount = triangleData.length / FLOATS_PER_TRIANGLE;
        const sphereData = serializeSpheres(scene);
        const sphereCount = sphereData.length / FLOATS_PER_SPHERE;
        tracer.updateScene(triangleData, triangleCount, sphereData, sphereCount);`,
  `        const { triangleData, bvhData } = serializeTriangles(scene);
        const triangleCount = triangleData.length / FLOATS_PER_TRIANGLE;
        const bvhNodeCount = bvhData.length / FLOATS_PER_BVH_NODE;
        const sphereData = serializeSpheres(scene);
        const sphereCount = sphereData.length / FLOATS_PER_SPHERE;
        tracer.updateScene(triangleData, triangleCount, sphereData, sphereCount, bvhData, bvhNodeCount);`
);

fs.writeFileSync(path, content);
console.log("Patched usePathTracer.ts");
