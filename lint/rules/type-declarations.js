const UTILITIES = new Set(["Pick", "Omit"]);

function paramsOf(node) {
  const { typeParameters = null } = node;
  if (typeParameters === null) {
    return [];
  }
  return typeParameters.params;
}

function typeParameterNames(node) {
  const names = new Set();
  for (let scope = node; scope !== null; scope = scope.parent) {
    for (const param of paramsOf(scope)) {
      names.add(param.name.name);
    }
  }
  return names;
}

function isUtility(member) {
  return (
    member.type === "TSTypeReference" &&
    member.typeName.type === "Identifier" &&
    UTILITIES.has(member.typeName.name) &&
    member.typeArguments !== null
  );
}

function declarationOf(statement) {
  if (statement.type === "ExportNamedDeclaration") {
    return statement.declaration;
  }
  return statement;
}

function isUnionAlias(declaration) {
  return (
    declaration !== null &&
    declaration.type === "TSTypeAliasDeclaration" &&
    declaration.typeAnnotation.type === "TSUnionType"
  );
}

function unionAliases(program) {
  return new Set(
    program.body
      .map((statement) => declarationOf(statement))
      .filter((declaration) => isUnionAlias(declaration))
      .map((declaration) => declaration.id.name),
  );
}

function isOpenName(base, open) {
  const { typeName } = base;
  return typeName.type === "Identifier" && open.has(typeName.name);
}

function isConcrete(pick, open) {
  const [base] = pick.typeArguments.params;
  return base.type === "TSTypeReference" && base.typeArguments === null && isOpenName(base, open) === false;
}

function picksToReport(node, unions) {
  const { types } = node.typeAnnotation;
  const picks = types.filter((member) => isUtility(member));
  const open = new Set([...typeParameterNames(node), ...unions]);
  const concrete = picks.every((pick) => isConcrete(pick, open));
  const ownMembers = types.some((member) => member.type === "TSTypeLiteral");
  if (concrete === true && ownMembers === true) {
    return picks;
  }
  return [];
}

const noOverloads = {
  create(context) {
    return {
      TSDeclareFunction(node) {
        if (node.declare !== true) {
          context.report({ messageId: "overload", node });
        }
      },
      TSEmptyBodyFunctionExpression(node) {
        if (node.parent.type === "MethodDefinition") {
          context.report({ messageId: "overload", node: node.parent });
        }
      },
    };
  },
  meta: {
    messages: {
      overload:
        "Overload signatures are not checked against the implementation. Use one signature, or a union of inputs with a discriminant.",
    },
    schema: [],
    type: "problem",
  },
};

const noPickIntersections = {
  create(context) {
    const aliases = { unions: new Set() };
    return {
      Program(program) {
        aliases.unions = unionAliases(program);
      },
      TSTypeAliasDeclaration(node) {
        if (node.typeAnnotation.type !== "TSIntersectionType") {
          return;
        }
        const [first = null] = picksToReport(node, aliases.unions);
        if (first !== null) {
          context.report({
            data: { name: node.id.name, utility: first.typeName.name },
            messageId: "intersection",
            node,
          });
        }
      },
    };
  },
  meta: {
    messages: {
      intersection:
        "Write `interface {{name}} extends {{utility}}<…> { … }` instead of an intersection: in an interface a member that clashes with a picked key is a compile error, where an intersection quietly makes it `never`.",
    },
    schema: [],
    type: "problem",
  },
};

export { noOverloads, noPickIntersections };
