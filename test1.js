import { parse } from 'acorn'
import { simple } from 'acorn-walk'

// 被解析的代码
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

// 解析代码生成 AST
const ast = parse(code, { ecmaVersion: 2020 });

// 存储每个 alert 的条件
const alertConditions = {};

function extractConditions(node, conditions) {
    if (node.type === "IfStatement") {
        const test = code.substring(node.test.start, node.test.end);
        if (node.consequent.type === "BlockStatement") {
            node.consequent.body.forEach((stmt) => {
                extractConditions(stmt, [...conditions, test]);
            });
        } else {
            extractConditions(node.consequent, [...conditions, test]);
        }
        if (node.alternate) {
            if (node.alternate.type === "BlockStatement") {
                node.alternate.body.forEach((stmt) => {
                    extractConditions(stmt, [...conditions, `!(${test})`]);
                });
            } else {
                extractConditions(node.alternate, [...conditions, `!(${test})`]);
            }
        }
    } else if (node.type === "ExpressionStatement" && node.expression.type === "CallExpression" && node.expression.callee.name === "alert") {
        const alertNum = node.expression.arguments[0].value;
        alertConditions[alertNum] = conditions.join(" && ");
    }
}

// 遍历 AST，提取条件
simple(ast, {
    FunctionDeclaration(node) {
        if (node.id.name === "foo") {
            node.body.body.forEach((stmt) => extractConditions(stmt, []));
        }
    },
});

// 输出每个 alert 的条件
console.log("解析每一个 alert 的执行条件:");
Object.keys(alertConditions).forEach((key) => {
    console.log(`Alert ${key}: ${alertConditions[key]}`);
});