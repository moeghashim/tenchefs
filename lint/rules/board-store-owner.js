const CLIENT = "createCookoutClient";

function sourceOf(node) {
  const { source = null } = node;
  if (source === null) {
    return "";
  }
  return String(source.value);
}

function isModule(source, name) {
  return [`/${name}/index.ts`, `/${name}`].some((end) => source.endsWith(end) === true);
}

function nameOf(named) {
  if (named.type === "Literal") {
    return named.value;
  }
  return named.name;
}

function namedOf(specifier) {
  const { imported = null, local = null } = specifier;
  const named = imported ?? local;
  if (named === null) {
    return "";
  }
  return nameOf(named);
}

function takesClient(node) {
  if (node.type === "ExportAllDeclaration") {
    return true;
  }
  return node.specifiers.some(
    (specifier) => specifier.type === "ImportNamespaceSpecifier" || namedOf(specifier) === CLIENT,
  );
}

function check(context, node) {
  const source = sourceOf(node);
  if (isModule(source, "live")) {
    context.report({ messageId: "live", node });
    return;
  }
  if (isModule(source, "sdk") && takesClient(node) === true) {
    context.report({ messageId: "client", node });
  }
}

const boardStoreOwner = {
  create(context) {
    return {
      ExportAllDeclaration(node) {
        check(context, node);
      },
      ExportNamedDeclaration(node) {
        check(context, node);
      },
      ImportDeclaration(node) {
        check(context, node);
      },
    };
  },
  meta: {
    messages: {
      client:
        "Only the board store (app/modules/board) and app/web.tsx make an SDK client. Read server state through the board store's selectors and change it through its methods.",
      live: "Only the board store (app/modules/board) and app/web.tsx use the live module. Read the link and every live change through the board store instead.",
    },
    schema: [],
    type: "problem",
  },
};

export { boardStoreOwner };
