import esprima from 'esprima';
import estraverse from 'estraverse';
import escodegen from 'escodegen';
import xlsx from 'xlsx'
import path from 'path';
/**
 * 分析给定的 JavaScript 代码以查找函数调用及其条件。
 *
 * @param {string} code - 要分析的 JavaScript 代码。
 * @param {string} functionName - 要查找的函数名称。
 * @param {Array<string>} methods - 要查找的函数调用中的方法名称数组。
 * @returns {Array} - 包含函数调用及其条件的对象数组。
 * @throws {Error} - 如果代码无法解析时抛出错误。
 */
export function analyzeFunctionCalls(code, functionName, methods) {
    try {
        const ast = esprima.parseScript(code, { range: true, tokens: true, comment: true });
        const functionCalls = [];
        const variableMap = {};
        // 树形条件堆栈：每个元素表示一层条件分支的上下文
        const conditionStack = [];
        let currentConditionChain = [];

        estraverse.traverse(ast, {
            enter: function (node, parent) {
                // 处理变量声明
                if (node.type === 'VariableDeclaration') {
                    node.declarations.forEach(declaration => {
                        if (declaration.init) {
                            variableMap[declaration.id.name] = escodegen.generate(declaration.init);
                        }
                    });
                }

                // 处理 IfStatement
                if (node.type === 'IfStatement') {
                    const condition = replaceVariablesInCondition(escodegen.generate(node.test), variableMap);
                    const parentChain = currentConditionChain.slice(); // 复制父级条件链

                    // 创建新分支上下文
                    const branchContext = {
                        parent: parentChain,  // 父级条件链（非引用）
                        branches: []
                    };
                    conditionStack.push(branchContext);

                    // 添加 if 分支
                    branchContext.branches.push({
                        type: 'if',
                        condition: condition,
                        fullCondition: [...parentChain, condition]
                    });
                    currentConditionChain = branchContext.branches[0].fullCondition;
                }

                // 处理 else if
                if (node.type === 'IfStatement' && parent.type === 'IfStatement' && parent.alternate === node) {
                    const context = conditionStack[conditionStack.length - 1];
                    const lastBranch = context.branches[context.branches.length - 1];

                    // 生成否定条件：非(上一个条件)
                    const negated = `非(${lastBranch.condition})`;
                    const currentCondition = replaceVariablesInCondition(escodegen.generate(node.test), variableMap);

                    // 添加 else if 分支
                    context.branches.push({
                        type: 'elseif',
                        condition: `${negated} 并且 ${currentCondition}`,
                        fullCondition: [...context.parent, `${negated} 并且 ${currentCondition}`]
                    });
                    currentConditionChain = context.branches[context.branches.length - 1].fullCondition;
                }

                // 处理 else 块
                if (node.type === 'BlockStatement' && parent.type === 'IfStatement' && parent.alternate === node) {
                    const context = conditionStack[conditionStack.length - 1];
                    const lastBranch = context.branches[context.branches.length - 1];

                    // 生成否定条件：非(${lastBranch.condition})
                    const negated = `非(${lastBranch.condition})`;

                    // 添加 else 分支
                    context.branches.push({
                        type: 'else',
                        condition: negated,
                        fullCondition: [...context.parent, negated]
                    });
                    currentConditionChain = context.branches[context.branches.length - 1].fullCondition;
                }
                // 收集函数调用
                if (node.type === 'CallExpression') {
                    const callee = node.callee;
                    let condition = currentConditionChain.join(' 并且 ');

                    if
                        (callee.type === 'Identifier' && methods.includes(callee.name)) {
                        functionCalls.push({
                            call: escodegen.generate(node),
                            condition: condition || null
                        });
                    } else if (
                        callee.type === 'MemberExpression' &&
                        callee.object.name === functionName &&
                        methods.includes(callee.property.name)
                    ) {
                        functionCalls.push({
                            call: escodegen.generate(node),
                            condition: condition || null
                        });
                    }
                }
            },
            leave: function (node) {
                // 离开 IfStatement 时，恢复父级条件链
                if (node.type === 'IfStatement') {
                    const context = conditionStack.pop();
                    currentConditionChain = context.parent;
                }
            }
        });

        return functionCalls;
    } catch (error) {
        console.error('Error parsing code:', error);
        return [];
    }
}

// 变量替换和条件翻译（保持不变）
function replaceVariablesInCondition(condition, variableMap) {
    let replacedCondition = condition.replace(/\b\w+\b/g, (match) => {
        return variableMap[match] !== undefined ? variableMap[match] : match;
    });

    replacedCondition = replacedCondition
        .replace(/>=/g, '大于等于')
        .replace(/<=/g, '小于等于')
        .replace(/===/g, '等于')
        .replace(/==/g, '等于')
        .replace(/!=/g, '不等于')
        .replace(/>/g, '大于')
        .replace(/</g, '小于')
        .replace(/\|\|/g, '或')
        .replace(/&&/g, '且')
        .replace(/!/g, '非');
    return replacedCondition;
}

export function replaceFunctionCalls(code) {
    if (typeof code === 'string') {
        // 正则表达式匹配 DV.getFieldValue('参数')
        const regexFiledValue = /DV\.getFieldValue\('([^']*)'\)/g;

        // 正则表达式匹配 DV.toFloat('参数')
        const regexFloat = /DV\.toFloat\(([^)]+)\)/g;

        // 正则表达式匹配 .equals('参数')
        const regexEquals = /\.equals\(([^)]+)\)/g;

        // 正则表达式匹配 SYS_BeFloat('参数')
        const regexJsFloat = /SYS_BeFloat\(([^)]+)\)/g;

        // 正则表达式匹配 $F.参数.value
        const regexJs$F = /\$F\.([a-zA-Z_][a-zA-Z0-9_]*)\.value/g;

        // 正则表达式匹配 document.MAINFORM.参数.value
        const regexJsDocumentMainform = /document\.MAINFORM\.([a-zA-Z_][a-zA-Z0-9_]*)\.value/g;

        // 正则表达式匹配 document.getElementById('参数').value
        const regexJsDocumentGetElement = /document\.getElementById\(([^)]+)\)/g;

        // 正则表达式匹配 $E('参数').value
        const regexJs$E = /\$E\((.*?)\)\.value/g


        // 替换为参数内容
        const replacedCode = code.replace(regexFiledValue, '$1')
            .replace(regexFloat, '$1')
            .replace(regexEquals, ' = $1')
            .replace(regexJsFloat, '$1')
            .replace(regexJsDocumentMainform, '$1')
            .replace(regexJsDocumentGetElement, '$1')
            .replace(regexJs$F, '$1')
            .replace(regexJs$E, '$1');
        return replacedCode;
    } else {
        return ''
    }
}

export function replaceFieldsWithDescriptions(conditionStr, funcId) {
    const regex = /[A-Z0-9_]+/g;
    const str = conditionStr.replace(regex, (match) => {
        const desc = getDescByField(funcId, match);
        return desc
    });
    return str
}

// 缓存所有已读取的 Excel 数据（路径 → 数据）
const excelDataCache = new Map();

// 缓存所有属性表的 Map 结构（路径 → Map<id, item>）
const attrMapCache = new Map();

// 统一路径处理函数（确保路径一致性）
const resolvePath = (basePath, relativePath) =>
    path.resolve(basePath, relativePath).replace(/\\/g, '/');

// 读取 Excel 数据（带缓存）
export function getExcelData(excelPath) {
    const normalizedPath = resolvePath(process.cwd(), excelPath);

    if (excelDataCache.has(normalizedPath)) {
        return excelDataCache.get(normalizedPath);
    }

    const workbook = xlsx.readFile(normalizedPath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    const headerRow = data[0];
    const result = data.slice(1).map(row => {
        const obj = {};
        headerRow.forEach((header, index) => {
            obj[header] = row[index] ?? null; // 处理空值
        });
        return obj;
    });

    excelDataCache.set(normalizedPath, result);
    return result;
}

// 预缓存 handleFunction 数据（固定路径）
let funcDataCache = null;

// 获取handleFunction.xlsx 中的数据
const getFuncData = () => {
    const handleFunctionPath = resolvePath('./output', 'handleFunction.xlsx');
    if (!funcDataCache) {
        funcDataCache = getExcelData(handleFunctionPath);
    }
    return funcDataCache;
};

// 获取描述通过栏位id
export const getDescByField = (funcId, fieldId) => {

    // 1. 获取 JSP 文件名
    const funcData = getFuncData();
    const jspItem = funcData.find(item => item.FuncId === funcId);

    if (!jspItem?.JspFile) {
        console.log(`funcId:${funcId}, fieldId: ${fieldId} 未找到 JSP 文件名`);
        return fieldId;
    }

    // 2. 获取属性表数据
    const attrDir = resolvePath('./output', 'handleJspAttr');
    const attrPath = resolvePath(attrDir, `${jspItem.JspFile}.xlsx`);

    // 3. 尝试从缓存获取 Map 结构
    let attrMap = attrMapCache.get(attrPath);
    if (!attrMap) {
        const attrData = getExcelData(attrPath);
        attrMap = new Map(attrData.map(item => [item.id, item]));
        attrMapCache.set(attrPath, attrMap);
    }

    // 4. 快速查找
    const desc = attrMap.get(fieldId);
    return desc?.title || fieldId;
};