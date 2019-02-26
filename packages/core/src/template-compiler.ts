import stripBom from 'strip-bom';
import { ResolverInstance, Resolution } from './resolver';

export interface Plugins {
  [type: string]: unknown[];
}

export interface Compiler {
  precompile(templateContents: string, options: any): string;
  registerPlugin(type: string, plugin: unknown): void;
  _Ember: any;
}

function inScope(scopeStack: string[][], name: string) {
  for (let scope of scopeStack) {
    if (scope.includes(name)) {
      return true;
    }
  }
  return false;
}

function makeResolverTransform(resolver: ResolverInstance, dependencies: Map<string, Resolution[]>) {
  return function resolverTransform(env: { moduleName: string }) {
    let deps: Resolution[] = [];
    dependencies.set(env.moduleName, deps);

    let scopeStack: string[][] = [];

    return {
      name: 'embroider-build-time-resolver',

      visitor: {
        Program: {
          enter(node: any) {
            if (node.blockParams.length > 0) {
              scopeStack.push(node.blockParams);
            }
          },
          exit(node: any) {
            if (node.blockParams.length > 0) {
              scopeStack.pop();
            }
          }
        },
        SubExpression(node: any) {
          if (inScope(scopeStack, node.path.original)) {
            return;
          }
          let resolution = resolver.resolveSubExpression(node.path.original, env.moduleName);
          if (resolution) {
            deps.push(resolution);
          }
        },
        MustacheStatement(node: any) {
          if (inScope(scopeStack, node.path.original)) {
            return;
          }
          let resolution = resolver.resolveMustache(node.path.original, env.moduleName);
          if (resolution) {
            deps.push(resolution);
          }
        },
        ElementNode(node: any) {
          if (inScope(scopeStack, node.tag)) {
            return;
          }
          let resolution = resolver.resolveElement(node.tag, env.moduleName);
          if (resolution) {
            deps.push(resolution);
          }
        },
      }
    };
  };
}

export default function setupCompiler(compiler: Compiler, resolver: ResolverInstance, EmberENV: unknown, plugins: Plugins) {
  let dependencies:  Map<string, Resolution[]> = new Map();

  registerPlugins(compiler, plugins);
  compiler.registerPlugin('ast', makeResolverTransform(resolver, dependencies));
  initializeEmberENV(compiler, EmberENV);

  function dependenciesOf(moduleName: string): Resolution[] | undefined {
    return dependencies.get(moduleName);
  }

  function compile(moduleName: string, contents: string) {
    let compiled = compiler.precompile(
      stripBom(contents), {
        contents,
        moduleName
      }
    );
    let lines: string[] = [];
    let deps = dependenciesOf(moduleName);
    if (deps) {
      let counter = 0;
      for (let dep of deps) {
        for (let { runtimeName, path } of dep.modules) {
          lines.push(`import a${counter} from "${path}";`);
          lines.push(`window.define('${runtimeName}', function(){ return a${counter++}});`);
        }
      }
    }
    lines.push(`export default Ember.HTMLBars.template(${compiled});`);
    return lines.join("\n");
  }
  return { compile, dependenciesOf };
}

function registerPlugins(compiler: Compiler, plugins: Plugins) {
  for (let type in plugins) {
    for (let i = 0, l = plugins[type].length; i < l; i++) {
      compiler.registerPlugin(type, plugins[type][i]);
    }
  }
}

function initializeEmberENV(templateCompiler: Compiler, EmberENV: any) {
  if (!templateCompiler || !EmberENV) { return; }

  let props;

  if (EmberENV.FEATURES) {
    props = Object.keys(EmberENV.FEATURES);

    props.forEach(prop => {
      templateCompiler._Ember.FEATURES[prop] = EmberENV.FEATURES[prop];
    });
  }

  if (EmberENV) {
    props = Object.keys(EmberENV);

    props.forEach(prop => {
      if (prop === 'FEATURES') { return; }

      templateCompiler._Ember.ENV[prop] = EmberENV[prop];
    });
  }
}
