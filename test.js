import esprima from 'esprima';
import estraverse from 'estraverse';
import escodegen from 'escodegen';

export function analyzeFunctionCalls(code, functionName, methods) {
    try {
        const ast = esprima.parseScript(code, { range: true, tokens: true, comment: true });
        const functionCalls = [];
        const variableMap = {};
        
        // 树形条件链管理（使用根节点初始化）
        let currentConditionNode = { 
            condition: null, 
            parent: null, 
            children: [] 
        };

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
                    
                    // 创建新的条件节点并链接到当前节点
                    const newNode = {
                        condition: condition,
                        parent: currentConditionNode,
                        children: []
                    };
                    
                    currentConditionNode.children.push(newNode);
                    currentConditionNode = newNode;
                }

                // 处理 else if
                if (
                    node.type === 'IfStatement' &&
                    parent.type === 'IfStatement' &&
                    parent.alternate === node
                ) {
                    // 获取父 if 的条件
                    const parentIfCondition = currentConditionNode.parent.condition;
                    const currentCondition = processCondition(node.test, variableMap);
                    
                    // 创建 else if 节点
                    const newNode = {
                        condition: `非(${parentIfCondition}) 且 ${currentCondition}`,
                        parent: currentConditionNode.parent, // 关键修正：父节点指向原 if 的父级
                        children: []
                    };
                    
                    currentConditionNode.parent.children.push(newNode);
                    currentConditionNode = newNode;
                }

                // 处理 else 块
                if (
                    node.type === 'BlockStatement' &&
                    parent.type === 'IfStatement' &&
                    parent.alternate === node
                ) {
                    // 获取父 if 的条件
                    const parentIfCondition = currentConditionNode.parent.condition;
                    
                    // 创建 else 节点
                    const newNode = {
                        condition: `非(${parentIfCondition})`,
                        parent: currentConditionNode.parent, // 关键修正：父节点指向原 if 的父级
                        children: []
                    };
                    
                    currentConditionNode.parent.children.push(newNode);
                    currentConditionNode = newNode;
                }

                // 收集函数调用
                if (node.type === 'CallExpression') {
                    const callee = node.callee;
                    const fullCondition = getFullConditionChain(currentConditionNode);
                    
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
                // 离开 if 语句时回溯到父节点
                if (node.type === 'IfStatement') {
                    currentConditionNode = currentConditionNode.parent;
                }
            }
        });

        return functionCalls;
    } catch (error) {
        console.error('Error parsing code:', error);
        return [];
    }
}

// 生成完整条件链（从根到当前节点）
function getFullConditionChain(node) {
    const path = [];
    let current = node;
    while (current && current.condition !== null) {
        path.unshift(current.condition);
        current = current.parent;
    }
    return path.join(' 并且 ');
}

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
console.log(analyzeFunctionCalls(`


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




`, "DV",["alert"]));

