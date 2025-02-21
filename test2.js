import { parse } from 'acorn';
import { simple } from 'acorn-walk';
import escodegen from 'escodegen';

// 优化后的条件处理
function processCondition(testNode, variableMap) {
    return escodegen.generate(testNode)
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

// 分析函数调用
export function analyzeFunctionCalls(code, functionName, methods) {
    const ast = parse(code, { ecmaVersion: 2020 });
    const alertConditions = {};

    function extractConditions(node, conditions, variableMap) {
        if (node.type === "VariableDeclaration") {
            node.declarations.forEach(declaration => {
                if (declaration.id.type === "Identifier" && declaration.init.type === "Literal") {
                    variableMap[declaration.id.name] = declaration.init.value;
                }
            });
        } else if (node.type === "IfStatement") {
            const test = processCondition(node.test, variableMap);
            if (node.consequent.type === "BlockStatement") {
                node.consequent.body.forEach((stmt) => {
                    extractConditions(stmt, [...conditions, test], variableMap);
                });
            } else {
                extractConditions(node.consequent, [...conditions, test], variableMap);
            }
            if (node.alternate) {
                if (node.alternate.type === "BlockStatement") {
                    node.alternate.body.forEach((stmt) => {
                        extractConditions(stmt, [...conditions, `非(${test})`], variableMap);
                    });
                } else {
                    extractConditions(node.alternate, [...conditions, `非(${test})`], variableMap);
                }
            }
        } else if (node.type === "ExpressionStatement" && node.expression.type === "CallExpression" && methods.includes(node.expression.callee.name)) {
            const alertNum = node.expression.arguments[0].value;
            alertConditions[alertNum] = conditions.join(" 且 ");
        }
    }

    simple(ast, {
        FunctionDeclaration(node) {
            if (node.id.name === functionName) {
                const variableMap = {}; // 变量映射表
                node.body.body.forEach((stmt) => extractConditions(stmt, [], variableMap));
            }
        },
    });

    return alertConditions;
}

const code = `
function foo(a, b) {
    var c = 100
    if(c > a){
        if( a > 200){
            alert(1)
            alert(4)
        }else if(a > 100){
            alert(2)
            if(b > 200){
                alert(5)
            }else{
                alert(6)
            }
            alert(7)
        }else{
            alert(3)

            if(b > 200){
                alert(8)
            }else{
                alert(9)
            }
            alert(10)
        }    
    }
}
`;

console.log(analyzeFunctionCalls(code, "foo", ["alert"]));