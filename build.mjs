var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};
import esbuild from "esbuild";
import path from "path";
import fs from "fs";
function getUrlParams(search) {
  let hashes = search.slice(search.indexOf("?") + 1).split("&");
  return hashes.reduce((params, hash) => {
    let [key, val] = hash.split("=");
    return Object.assign(params, { [key]: decodeURIComponent(val) });
  }, {});
}
const prefix = /^@\//;
function replacePrefix(str) {
  return str.replace(prefix, process.cwd() + "/src/");
}
function fileExists(path2) {
  return __async(this, null, function* () {
    try {
      const stat = yield fs.promises.stat(path2);
      return stat.isFile();
    } catch (err) {
      return false;
    }
  });
}
const aliasPlugin = {
  name: "alias",
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => __async(this, null, function* () {
      const aliased = replacePrefix(args.path);
      const fullPath = path.isAbsolute(aliased) ? aliased : path.join(args.resolveDir, aliased);
      if (!(yield fileExists(fullPath))) {
        const tries = [
          ".ts",
          ".js",
          "/index.ts",
          "/index.js"
        ];
        for (const post of tries) {
          if (yield fileExists(fullPath + post)) {
            return {
              path: path.normalize(fullPath + post),
              namespace: "file"
            };
          }
        }
      } else if (aliased != args.path) {
        return {
          path: path.normalize(aliased),
          namespace: "file"
        };
      }
    }));
  }
};
import sfc from "@vue/compiler-sfc";
import pug from "pug";
import sass from "sass";
const vuePlugin = {
  name: "vue",
  setup(build) {
    build.initialOptions.define = __spreadProps(__spreadValues({}, build.initialOptions.define), {
      "__VUE_OPTIONS_API__": "false",
      "__VUE_PROD_DEVTOOLS__": "false"
    });
    let idCounter = 1e3;
    build.onResolve({ filter: /\.vue/ }, (args) => __async(this, null, function* () {
      const params = getUrlParams(args.path);
      return {
        path: path.isAbsolute(args.path) ? args.path : path.join(args.resolveDir, args.path),
        namespace: params.type === "script" ? "sfc-script" : params.type === "template" ? "sfc-template" : params.type === "style" ? "sfc-style" : "file",
        pluginData: __spreadProps(__spreadValues({}, args.pluginData), {
          index: params.index
        })
      };
    }));
    build.onLoad({ filter: /\.vue$/ }, (args) => __async(this, null, function* () {
      const encPath = args.path.replace(/\\/g, "\\\\");
      const source = yield fs.promises.readFile(args.path, "utf8");
      const filename = path.relative(process.cwd(), args.path);
      const { descriptor } = sfc.parse(source, {
        filename
      });
      const id = "data-v-" + idCounter++;
      let code = "";
      if (descriptor.script || descriptor.scriptSetup) {
        code += `import script from "${encPath}?type=script";`;
      } else {
        code += "let script = {};";
      }
      for (const style in descriptor.styles) {
        code += `import "${encPath}?type=style&index=${style}";`;
      }
      code += `import { render } from "${encPath}?type=template"; script.render = render;`;
      code += `script.__file = ${JSON.stringify(filename)}; script.__scopeId = ${JSON.stringify(id)};`;
      code += "export default script;";
      return {
        contents: code,
        resolveDir: path.dirname(args.path),
        pluginData: { descriptor, id },
        watchFiles: [args.path]
      };
    }));
    build.onLoad({ filter: /.*/, namespace: "sfc-script" }, (args) => __async(this, null, function* () {
      const { descriptor, id } = args.pluginData;
      if (descriptor.script || descriptor.scriptSetup) {
        const script = sfc.compileScript(descriptor, { id });
        return {
          contents: script.content,
          loader: script.lang === "ts" ? "ts" : "js",
          resolveDir: path.dirname(args.path)
        };
      }
    }));
    build.onLoad({ filter: /.*/, namespace: "sfc-template" }, (args) => __async(this, null, function* () {
      const { descriptor, id } = args.pluginData;
      let source = descriptor.template.content;
      if (descriptor.template.lang === "pug") {
        source = pug.render(descriptor.template.content);
        source = source.replace(/(#.*?|v-else)="\1"/g, "$1");
      }
      const template = sfc.compileTemplate({
        id,
        source,
        filename: args.path,
        scoped: descriptor.styles.some((o) => o.scoped)
      });
      return {
        contents: template.code,
        loader: "js",
        resolveDir: path.dirname(args.path)
      };
    }));
    build.onLoad({ filter: /.*/, namespace: "sfc-style" }, (args) => __async(this, null, function* () {
      const { descriptor, index, id } = args.pluginData;
      const style = descriptor.styles[index];
      let source = style.content;
      let includedFiles = [];
      if (style.lang === "sass" || style.lang === "scss") {
        const result = yield new Promise((resolve, reject) => sass.render({
          data: source,
          indentedSyntax: style.lang === "sass",
          includePaths: [
            path.dirname(args.path)
          ],
          importer: [
            (url) => {
              const modulePath = path.join(process.cwd(), "node_modules", url);
              if (fs.existsSync(modulePath)) {
                return { file: modulePath };
              }
              return null;
            },
            (url) => ({ file: replacePrefix(url) })
          ]
        }, (ex, res) => ex ? reject(ex) : resolve(res)));
        includedFiles = result.stats.includedFiles;
        source = String(result.css);
      }
      const template = yield sfc.compileStyleAsync({
        filename: args.path,
        id,
        source,
        scoped: style.scoped
      });
      return {
        contents: template.code,
        loader: "css",
        resolveDir: path.dirname(args.path),
        watchFiles: includedFiles
      };
    }));
  }
};
const buildOpts = {
  entryPoints: ["src/main-client.ts"],
  bundle: true,
  outfile: "dist/out.js",
  plugins: [aliasPlugin, vuePlugin],
  target: "es2015"
};
if (process.argv.includes("--serve")) {
  esbuild.serve({
    servedir: "dist",
    port: 8080
  }, buildOpts);
  console.log("Serving on http://localhost:8080");
} else {
  if (process.argv.includes("-w")) {
    buildOpts.watch = true;
    console.log("Watching for changes");
  }
  esbuild.build(buildOpts).catch(() => process.exit(1));
}
//# sourceMappingURL=build.mjs.map