const { readFileSync, writeFileSync } = require("fs");
const { resolve } = require("path");

const Handlebars = require("handlebars");
const set = require("lodash.set");
const pascalCase = require("pascal-case");
const prettier = require("prettier");
const { stringToJsdocComment } = require("string-to-jsdoc-comment");
const sortKeys = require("sort-keys");

const ENDPOINTS = require("./generated/Endpoints.json");
const ENDPOINTS_PATH = resolve(
  process.cwd(),
  "src",
  "generated",
  "Endpoints.ts"
);
const ENDPOINTS_TEMPLATE_PATH = resolve(
  process.cwd(),
  "scripts",
  "update-endpoints",
  "templates",
  "endpoints.ts.template"
);

Handlebars.registerHelper("union", function(endpoints, key) {
  return endpoints.map(endpoint => endpoint[key]).join(" | ");
});
Handlebars.registerHelper("name", function(parameter) {
  let name = parameter.key;

  if (/[.\[]/.test(name)) {
    name = `"${name}"`;
  }

  if (parameter.required) {
    return name;
  }

  return `${name}?`;
});

Handlebars.registerHelper("type", function(parameter) {
  const type = typeMap[parameter.type] || parameter.type;

  if (parameter.allowNull) {
    return `${type} | null`;
  }

  return type;
});
const template = Handlebars.compile(
  readFileSync(ENDPOINTS_TEMPLATE_PATH, "utf8")
);

const endpointsByRoute = {};

const typeMap = {
  integer: "number",
  "integer[]": "number[]"
};

for (const endpoint of ENDPOINTS) {
  const route = `${endpoint.method} ${endpoint.url.replace(
    /\{([^}]+)}/g,
    ":$1"
  )}`;

  if (!endpointsByRoute[route]) {
    endpointsByRoute[route] = [];
  }

  endpointsByRoute[route].push({
    optionsTypeName:
      pascalCase(`${endpoint.scope} ${endpoint.id}`) + "Endpoint",
    requestOptionsTypeName:
      pascalCase(`${endpoint.scope} ${endpoint.id}`) + "RequestOptions"
  });
}

const options = [];
const childParams = {};

for (const endpoint of ENDPOINTS) {
  const { method, parameters } = endpoint;

  const optionsTypeName =
    pascalCase(`${endpoint.scope} ${endpoint.id}`) + "Endpoint";
  const requestOptionsTypeName =
    pascalCase(`${endpoint.scope} ${endpoint.id}`) + "RequestOptions";

  options.push({
    in: {
      name: optionsTypeName,
      parameters: parameters
        .map(parameterize)
        // handle "object" & "object[]" types
        .map(parameter => {
          if (parameter.deprecated) {
            return;
          }

          const namespacedParamsName = pascalCase(
            `${endpoint.scope}.${endpoint.id}.Params`
          );

          if (parameter.type === "object" || parameter.type === "object[]") {
            const childParamsName = pascalCase(
              `${namespacedParamsName}.${parameter.key}`
            );

            parameter.type = parameter.type.replace("object", childParamsName);

            if (!childParams[childParamsName]) {
              childParams[childParamsName] = {};
            }
          }

          if (!/\./.test(parameter.key)) {
            return parameter;
          }

          const childKey = parameter.key.split(".").pop();
          const parentKey = parameter.key.replace(/\.[^.]+$/, "");

          parameter.key = childKey;

          const childParamsName = pascalCase(
            `${namespacedParamsName}.${parentKey}`
          );
          set(childParams, `${childParamsName}.${childKey}`, parameter);
        })
        .filter(Boolean)
    },
    out: {
      name: requestOptionsTypeName,
      method
    }
  });
}

const result = template({
  endpointsByRoute: sortKeys(endpointsByRoute, { deep: true }),
  options,
  childParams: Object.keys(childParams).map(key => {
    if (key === "GistsCreateParamsFiles") {
      debugger;
    }
    return {
      paramTypeName: key,
      params: Object.values(childParams[key])
    };
  })
});

writeFileSync(
  ENDPOINTS_PATH,
  prettier.format(result, { parser: "typescript" })
);
console.log(`${ENDPOINTS_PATH} updated.`);

function parameterize(parameter) {
  const key = parameter.name;
  const type = typeMap[parameter.type] || parameter.type;
  const enums = parameter.enum
    ? parameter.enum.map(JSON.stringify).join("|")
    : null;

  return {
    name: pascalCase(key),
    key: key,
    required: parameter.required,
    type: enums || type,
    alias: parameter.alias,
    deprecated: parameter.deprecated,
    allowNull: parameter.allowNull,
    jsdoc: stringToJsdocComment(parameter.description)
  };
}
