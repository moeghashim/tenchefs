const NOT_FOUND = -1;
const TEXT_LOCATORS = new Set(["getByLabel", "getByText"]);

function calledName(node) {
  const { callee } = node;
  if (callee.type !== "MemberExpression") {
    return null;
  }
  if (callee.computed === true) {
    return callee.property.value;
  }
  return callee.property.name;
}

function isPattern(node) {
  return (
    (node.type === "Literal" && Boolean(node.regex)) ||
    (node.type === "NewExpression" && node.callee.type === "Identifier" && node.callee.name === "RegExp")
  );
}

function isKey(property, key) {
  return property.type === "Property" && property.key.type === "Identifier" && property.key.name === key;
}

function keyed(options, key) {
  if (options === null || options.type !== "ObjectExpression") {
    return null;
  }
  const index = options.properties.findIndex((property) => isKey(property, key));
  if (index === NOT_FOUND) {
    return null;
  }
  return options.properties[index].value;
}

function isExact(options) {
  const exact = keyed(options, "exact");
  return exact !== null && exact.type === "Literal" && exact.value === true;
}

function unwrapped(node) {
  if (node.type === "TSAsExpression") {
    return unwrapped(node.expression);
  }
  return node;
}

function declaredObjects(declaration) {
  if (declaration.type !== "VariableDeclaration") {
    return [];
  }
  return declaration.declarations
    .filter(
      (declarator) =>
        declarator.id.type === "Identifier" &&
        declarator.init !== null &&
        unwrapped(declarator.init).type === "ObjectExpression",
    )
    .map((declarator) => [declarator.id.name, unwrapped(declarator.init)]);
}

function optionsOf(constants, node) {
  const [, options = null] = node.arguments;
  if (options !== null && options.type === "Identifier" && Object.hasOwn(constants, options.name)) {
    return constants[options.name];
  }
  return options;
}

function namedBy(name, first, options) {
  if (name === "getByRole") {
    return keyed(options, "name");
  }
  if (TEXT_LOCATORS.has(name)) {
    return first;
  }
  return null;
}

function problem(constants, node) {
  const [first = null] = node.arguments;
  const options = optionsOf(constants, node);
  const named = namedBy(calledName(node), first, options);
  if (named === null) {
    return null;
  }
  if (isPattern(named)) {
    return "pattern";
  }
  if (isExact(options)) {
    return null;
  }
  return "inexact";
}

const exactLocators = {
  create(context) {
    const constants = Object.fromEntries(
      context.sourceCode.ast.body.flatMap((statement) => declaredObjects(statement)),
    );
    return {
      CallExpression(node) {
        const messageId = problem(constants, node);
        if (messageId !== null) {
          context.report({ messageId, node });
        }
      },
    };
  },
  meta: {
    messages: {
      inexact:
        "A locator that names its element by string matches it by substring unless it passes exact: true, so it can find the wrong element. Add exact: true.",
      pattern:
        "A locator that names its element by a regular expression can match more than the element the test means. Name it by its exact string with exact: true.",
    },
    schema: [],
    type: "problem",
  },
};

export { exactLocators };
