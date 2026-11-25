const KEY_EVENTS = new Set(["keydown", "keypress", "keyup"]);
const HANDLERS = new Set(["onkeydown", "onkeypress", "onkeyup"]);
const PAGES = new Set(["document", "globalThis", "self", "window"]);

function propertyOf(node) {
  if (node.computed === true) {
    return node.property.value;
  }
  return node.property.name;
}

function isPage(node) {
  if (node.type === "Identifier") {
    return PAGES.has(node.name);
  }
  return node.type === "MemberExpression" && PAGES.has(propertyOf(node)) && isPage(node.object);
}

function isPageMember(node, isName) {
  return node.type === "MemberExpression" && isName(propertyOf(node)) === true && isPage(node.object) === true;
}

function isKeyEvent(node) {
  return node !== null && node.type === "Literal" && KEY_EVENTS.has(node.value);
}

function isKeyListener(node) {
  const [type = null] = node.arguments;
  return isPageMember(node.callee, (name) => name === "addEventListener") && isKeyEvent(type);
}

function isKeyHandler(node) {
  return isPageMember(node, (name) => HANDLERS.has(name));
}

const keymapOwner = {
  create(context) {
    return {
      AssignmentExpression(node) {
        if (isKeyHandler(node.left)) {
          context.report({ messageId: "listener", node });
        }
      },
      CallExpression(node) {
        if (isKeyListener(node)) {
          context.report({ messageId: "listener", node });
        }
      },
    };
  },
  meta: {
    messages: {
      listener:
        "Only app/modules/keymap listens for keys on the page. Add a row to the keymap's table and bind its action instead.",
    },
    schema: [],
    type: "problem",
  },
};

export { keymapOwner };
