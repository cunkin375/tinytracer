const fs = require('fs');
const file = 'components/PathTracerSandbox/hooks/usePathTracer.ts';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(
  'tracer.updateScene(triangleData, triangleCount, sphereData, sphereCount);',
  `console.log("triangleCount:", triangleCount, "sphereCount:", sphereCount, "FLOATS_PER_TRIANGLE:", FLOATS_PER_TRIANGLE);
        tracer.updateScene(triangleData, triangleCount, sphereData, sphereCount);`
);
fs.writeFileSync(file, content);
