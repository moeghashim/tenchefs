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

function isHumanKind(property) {
  return (
    property.type === "Property" &&
    property.key.type === "Identifier" &&
    property.key.name === "kind" &&
    property.value.type === "Literal" &&
    property.value.value === "human"
  );
}

function isAgentObject(request) {
  return request.type === "ObjectExpression" && request.properties.some((property) => isHumanKind(property)) === false;
}

function isAgentRequest(node) {
  const [request = null, extra = null] = node.arguments;
  return request !== null && extra === null && isAgentObject(request);
}

function makesAgent(node) {
  const name = calledName(node);
  return name === "createAgentForOwner" || (name === "createIdentity" && isAgentRequest(node));
}

const agentFactory = {
  create(context) {
    return {
      CallExpression(node) {
        if (makesAgent(node)) {
          context.report({ messageId: "factory", node });
        }
      },
    };
  },
  meta: {
    messages: {
      factory:
        "A test makes an agent only with createTestAgent from app/modules/testing, so a change to how agents are created edits one place. Pass what this call needs as its options.",
    },
    schema: [],
    type: "problem",
  },
};

export { agentFactory };
