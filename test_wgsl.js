const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    args: ['--enable-unsafe-webgpu']
  });
  const page = await browser.newPage();

  const wgsl = require('fs').readFileSync('./lib/webgpu/compute.wgsl', 'utf8');

  const result = await page.evaluate(async (code) => {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      const device = await adapter.requestDevice();
      
      const module = device.createShaderModule({ code });
      const compilationInfo = await module.getCompilationInfo();
      
      if (compilationInfo.messages.length > 0) {
        return compilationInfo.messages.map(m => \`[\${m.type}] Line \${m.lineNum}: \${m.message}\`).join('\\n');
      }
      return "OK";
    } catch (err) {
      return "JS Error: " + err.message;
    }
  }, wgsl);

  console.log(result);
  await browser.close();
})();
