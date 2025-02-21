# cs-js-tools

npm i
import esprima from 'esprima';
import estraverse from 'estraverse';
import escodegen from 'escodegen';

export function analyzeFunctionCalls(code, functionName, methods) {
    try {
        const ast = esprima.parseScript(code, { range: true, tokens: true, comment: true });
        const functionCalls = [];
        const variableMap = {};
        
        // 树形条件链管理
        let currentConditionContext = null;

        estraverse.traverse(ast, {
            enter: (node, parent) => {
                // 变量声明处理
                if (node.type === 'VariableDeclaration') {
                    node.declarations.forEach(declaration => {
                        if (declaration.init) {
                            variableMap[declaration.id.name] = escodegen.generate(declaration.init);
                        }
                    });
                }

                // 处理 if 语句
                if (node.type === 'IfStatement') {
                    const condition = processCondition(node.test, variableMap);
                    
                    // 创建新的条件上下文
                    const newContext = {
                        type: 'if',
                        condition: condition,
                        parent: currentConditionContext,
                        siblingNegation: null
                    };
                    
                    // 链接到父上下文
                    if (currentConditionContext) {
                        if (!currentConditionContext.children) currentConditionContext.children = [];
                        currentConditionContext.children.push(newContext);
                    }
                    
                    currentConditionContext = newContext;
                }

                // 处理 else if
                if (
                    node.type === 'IfStatement' &&
                    parent.type === 'IfStatement' &&
                    parent.alternate === node
                ) {
                    // 生成否定条件：非(父 if 条件)
                    const parentCondition = currentConditionContext.parent.condition;
                    const currentCondition = processCondition(node.test, variableMap);
                    
                    currentConditionContext = {
                        type: 'elseif',
                        condition: `非(${parentCondition}) 且 ${currentCondition}`,
                        parent: currentConditionContext.parent.parent, // 回溯两层（跳过 else 上下文）
                        siblingNegation: null
                    };
                }

                // 处理 else 块
                if (
                    node.type === 'BlockStatement' &&
                    parent.type === 'IfStatement' &&
                    parent.alternate === node
                ) {
                    // 生成否定条件：非(父 if 条件)
                    const parentCondition = currentConditionContext.parent.condition;
                    currentConditionContext = {
                        type: 'else',
                        condition: `非(${parentCondition})`,
                        parent: currentConditionContext.parent.parent,
                        siblingNegation: null
                    };
                }

                // 收集函数调用
                if (node.type === 'CallExpression') {
                    const callee = node.callee;
                    const fullCondition = getFullConditionChain(currentConditionContext);
                    
                    if (
                        (callee.type === 'Identifier' && methods.includes(callee.name)) ||
                        (callee.type === 'MemberExpression' &&
                         callee.object.name === functionName &&
                         methods.includes(callee.property.name))
                    ) {
                        functionCalls.push({
                            call: escodegen.generate(node),
                            condition: fullCondition
                        });
                    }
                }
            },
            leave: (node) => {
                // 离开 if 语句时回溯上下文
                if (node.type === 'IfStatement') {
                    currentConditionContext = currentConditionContext?.parent;
                }
            }
        });

        return functionCalls;
    } catch (error) {
        console.error('Error parsing code:', error);
        return [];
    }
}

// 生成完整条件链
function getFullConditionChain(context) {
    const conditions = [];
    let current = context;
    while (current) {
        conditions.unshift(current.condition);
        current = current.parent;
    }
    return conditions.join(' 并且 ');
}

// 处理条件表达式
function processCondition(testNode, variableMap) {
    const rawCondition = escodegen.generate(testNode);
    return rawCondition
        .replace(/\b\w+\b/g, m => variableMap[m] || m)
        .replace(/>=/g, '≥')
        .replace(/<=/g, '≤')
        .replace(/===/g, '等于')
        .replace(/==/g, '等于')
        .replace(/!=/g, '≠')
        .replace(/>/g, '＞')
        .replace(/</g, '＜')
        .replace(/\|\|/g, ' 或 ')
        .replace(/&&/g, ' 且 ')
        .replace(/!/g, '非');
}

// 测试用例
const code = `
function foo(a, b) {
    var c = 100;
    if (c > a) {
        if (a > 200) {
            alert(1);
            alert(4);
        } else if (a > 100) {
            alert(2);
            if (b > 200) {
                alert(5);
            } else {
                alert(6);
            }
            alert(7);
        } else {
            alert(3);
            if (b > 200) {
                alert(8);
            } else {
                alert(9);
            }
            alert(10);
        }
    }
}
`;

console.log(analyzeFunctionCalls(code, "DV", ["alert"]));