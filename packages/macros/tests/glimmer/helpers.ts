import { TemplateCompiler } from '@embroider/core';
import { emberTemplateCompilerPath, Project } from '@embroider/test-support';
import { MacrosConfig } from '../..';
import { join } from 'path';
const compilerPath = emberTemplateCompilerPath();

export { Project };

type CreateTestsWithConfig = (transform: (templateContents: string) => string, config: MacrosConfig) => void;
type CreateTests = (transform: (templateContents: string) => string) => void;

interface TemplateTransformOptions {
  filename?: string;
}

export function templateTests(createTests: CreateTestsWithConfig | CreateTests) {
  let { plugins, setConfig } = MacrosConfig.astPlugins();
  let config = MacrosConfig.for({});
  setConfig(config);
  let compiler = new TemplateCompiler({
    compilerPath,
    EmberENV: {},
    plugins: {
      ast: plugins,
    },
  });
  let transform = (templateContents: string, options: TemplateTransformOptions = {}) => {
    let filename = options.filename ?? join(__dirname, 'sample.hbs');

    return compiler.applyTransforms(filename, templateContents);
  };
  if (createTests.length === 2) {
    (createTests as CreateTestsWithConfig)(transform, config);
  } else {
    config.finalize();
    (createTests as CreateTests)(transform);
  }
}
