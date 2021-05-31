const { NodeAndOffset } = require('jscontenteditableelementtextselection');

/**
 * 用于风格化指定范围之内的文本的模块。
 *
 * - 所谓风格化，即把一段文字的指定范围的文字移入到一个 <span> 元素（下面称容器元素），
 *   然后设置该容器元素的 class name 为指定的名称。
 * - 待风格化的根元素之内必须是纯文本，或者只包含有 <span> 子元素。
 */
class TextStylization {

    /**
     *
     * @param {*} rootElement
     * @param {*} className 待风格化的样式的名称，当前只支持添加一个样式名称。
     * @param {*} documentObject 可选参数。如果用在非浏览器环境，需要设置 Document 对象，
     *     它可以由 domino 包的 domino.createDocument() 方法产生。
     * @param {*} nodeFilterObject 可选参数。如果用在非浏览器环境，需要设置 NodeFilter 对象，
     *     它可以由 domino 包导入，如 require('domino/lib/NodeFilter') 获得。
     */
    constructor(rootElement, className, documentObject, nodeFilterObject) {
        this.rootElement = rootElement;
        this.className = className;

        if (documentObject === undefined) {
            documentObject = global.document;
        }

        if (nodeFilterObject === undefined) {
            nodeFilterObject = global.NodeFilter;
        }

        this.documentObject = documentObject;
        this.nodeFilterObject = nodeFilterObject;
    }

    /**
     * 风格化指定范围之内的文本
     *
     * 如果待风格化的根元素是一个 contenteditable 的元素，文本被风格化之后，
     * 因为可能会插入了一些新的容器元素（<span class="className">），或者某些
     * Text Node 被打断，所以光标的位置有可能会发生改变，这时需要使用
     * jscontenteditableelementtextselection 库的 setSelection() 方法将
     * 原先的光标位置重新设置一下。
     *
     * 即假设原先光标位置的值是 {start:5, end:5}，文本被风格之后，光标的位置
     * 有可能发生变化，这时使用 setSelection({start:5, end:5}) 方法即可把
     * 光标恢复到原先的位置。
     *
     * @param {*} textSelections
     * @returns 返回所有受影响的（或者新建的）节点元素，以每一个 TextSelection 分组。
     */
    applyToRanges(textSelections) {

        // 返回的结果，内容是所有受影响的（或者新建的）节点元素，以每一个 TextSelection 分组。
        let affectedNodeGroups = [];

        if (textSelections.length === 0) {
            return affectedNodeGroups;
        }

        // 获取每一个 TextSelection 范围之内的所有 Node
        let nodeAndOffsetGroups = this._findNodeAndOffsetGroups(textSelections);

        // 更新每一组 nodeAndOffsets 的样式
        //
        // - 必须从最后一组 nodeAndOffsets 开始更新 Node，因为组和组之间有可能发生在
        //   同一个 Node 之内，更新样式时会截断它。
        for (let idx = nodeAndOffsetGroups.length - 1; idx >= 0; idx--) {
            let affectedNodes = [];
            affectedNodeGroups.push(affectedNodes);

            let nodeAndOffsets = nodeAndOffsetGroups[idx];
            if (nodeAndOffsets.length === 2 &&
                nodeAndOffsets[0].node === nodeAndOffsets[1].node) {
                // 当前组只有两个 NodeAndOffset，而且 Node 相同，说明
                // 待更新的是某一个 Node
                let nodes = this._applyToNode(
                    nodeAndOffsets[0].node,
                    nodeAndOffsets[0].offset,
                    nodeAndOffsets[1].offset);

                affectedNodes.push(...nodes);

            } else if (nodeAndOffsets.length >= 2) {
                // 当前组包含多个 Node，从最后一个开始更新

                // 末尾节点
                let tailIdx = nodeAndOffsets.length - 1;
                let tailNodeAndOffset = nodeAndOffsets[tailIdx];
                if (tailNodeAndOffset.offset > 0) {
                    // 这里需要判断 offset 值是否大于 0，因为最后一个 NodeAndOffset
                    // 有可能是无效的，比如有如下文本内容：
                    // 'abcde\n12345'
                    //
                    // 假设 'abcde'、'\n' 和 '12345' 分别属于 3 个不同的（DOM）Node，
                    // 当 TextSelection 的范围是 'cde' 时，则
                    // 第 1 个 NodeAndOffset 的内容是 'cde' 且 offset = 2
                    // 第 2 个 NodeAndOffset 的内容是 '\n' 且 offset = 0
                    // 所以第 2 个 NodeAndOffset 是无需更新的，跳过即可。
                    let nodes = this._applyToNode(
                        tailNodeAndOffset.node,
                        0,
                        tailNodeAndOffset.offset);

                    affectedNodes.push(...nodes);
                }

                // 所有中间节点
                for (let idx = nodeAndOffsets.length - 2; idx > 0; idx--) {
                    // https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeValue
                    // https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent
                    //
                    // Element 的 nodeValue = null
                    // Text Node 的 nodeValue = 文本

                    if (nodeAndOffsets[idx].node.nodeValue === '\n') {
                        // 跳过换行符节点
                        continue;
                    }

                    let node = this._applyToWholeNode(nodeAndOffsets[idx].node);
                    affectedNodes.push(node);
                }

                // 头节点
                let headNodeAndOffset = nodeAndOffsets[0];
                let nodes = this._applyToNode(
                    headNodeAndOffset.node,
                    headNodeAndOffset.offset,
                    headNodeAndOffset.node.nodeValue.length);

                affectedNodes.push(...nodes);
            }

            // 因为上面是从尾部开始更新的，所以需要反转 affectedNodes
            affectedNodes.reverse();
        }

        // 因为上面是从最后一组开始更新的，所以需要反转 allAffectedNodes
        affectedNodeGroups.reverse();
        return affectedNodeGroups;
    }

    /**
     * 搜索每一个 TextSelection 范围之内的节点及偏移值
     *
     * @param {*} textSelections
     * @returns 返回一个 NodeAndOffset 对象的数组的集合（数组的数组）
     */
    _findNodeAndOffsetGroups(textSelections) {
        // 返回的结果，一个 NodeAndOffset 对象的数组的集合（数组的数组）
        let nodeAndOffsetGroups = [];

        // 一个 TextSelection 有 start 位置及 end 位置，位于这个范围之内的所有
        // 节点（NodeAndOffset）都会被添加到一个组（NodeAndOffsetGroup）里。
        //
        // 在一个组里，第一个元素是开始节点，最后一个元素是结束节点：
        // - 一个组里可能会有多个 NodeAndOffset
        // - 一个组里可能有两个 NodeAndOffset，但其实它们都是同一个 Node，只是
        //   偏移值（offset）不同而已。即某个 TextSelection 落在某个 Node 的
        //   中间位置。

        // 一个 TextSelection 的所有 NodeAndOffset
        let nodeAndOffsets = [];
        nodeAndOffsetGroups.push(nodeAndOffsets);

        // 为了简化程序，将 TextSelection 的 start 和 end 都放进一个 position 数组里，
        // 然后共用同一个搜索过程。
        // 详细原理请见 jscontenteditableelementtextselection 包的
        // findNodeAndOffsets() 方法。
        // https://github.com/hemashushu/jscontenteditableelementtextselection

        let positions = [];
        for (let textSelection of textSelections) {
            positions.push(textSelection.start);
            positions.push(textSelection.end);
        }

        let position = positions.shift(); // current searching postition.
        let workerPosStart = 0; // current node start position, equals to 'offset', include
        let workerPosEnd = 0; // current node end position, equals to 'offset', include

        // 一个标记，用来断定当前是在搜索 start position 还是 end position
        let isFindingTextSelectionEndPos = false;

        let treeWalker = this.documentObject.createTreeWalker(this.rootElement, this.nodeFilterObject.SHOW_TEXT);
        while (treeWalker.nextNode()) {
            let currentNode = treeWalker.currentNode;
            let nodeValue = currentNode.nodeValue;

            let nodeValueLength = (nodeValue === null) ? 0 : nodeValue.length;
            workerPosEnd = workerPosStart + nodeValueLength - 1; // 因为 end position 对应的字符也是被包含的，所以需要减去 1。

            if (isFindingTextSelectionEndPos && position > workerPosEnd) {
                // 当前节点位于当前 TextSelection 范围之内
                // 添加到组里。
                nodeAndOffsets.push(new NodeAndOffset(currentNode, 0));
            }

            // 检查当前搜索位置是否在当前节点之内
            while (position >= workerPosStart && position <= workerPosEnd) {
                // 添加到结果
                nodeAndOffsets.push(new NodeAndOffset(currentNode, position - workerPosStart));

                if (isFindingTextSelectionEndPos) {
                    // 已完成当前 TextSelection 的搜索
                    isFindingTextSelectionEndPos = false;

                    // 准备搜索下一个 TextSelection
                    nodeAndOffsets = [];
                    nodeAndOffsetGroups.push(nodeAndOffsets);

                } else {
                    isFindingTextSelectionEndPos = true;
                }

                if (positions.length === 0) {
                    // 已经到达待搜索位置的尽头，返回结果
                    return nodeAndOffsetGroups;
                }

                // 检查下一个搜索位置是否也在当前节点之内
                position = positions.shift();
            }

            // 搜索下一个节点
            workerPosStart += nodeValueLength;
        }

        // 为什么程序会运行到这里呢？
        //
        // 1. 因为上面 workerPosEnd 被设定为字符包括
        //    （什么是字符包括？比如函数 String.substring(start, end) 当中的
        //    start 是字符包括的，而 end是不包括的。），
        //    而 endPosition 参数是位置值，有可能其值刚好是文本的末尾，比如：
        //
        //    0 1 2 3 4 5 <-- endPosition: 5
        //     a b[c d e] <-- text
        //     0 1 2 3 4  <-- workerPosStart/workerPosEnd，相当于字符索引（offset）
        //
        //    上面的搜索只能到达字母 “e”，即 offset 4，而 endPosition 5 因为大于 4 而
        //    导致来到这里。
        //    至于 workerPosEnd 为什么要设定为字符包含，而不是类似 substring() 函数的 end
        //    设定为索引值 +1，因为比较 startPosition 时是字符包含的，所以为简化程序，
        //    在比较时都设定为字符包含。
        //
        // 2. 有可能 endPosition 的值超出了文本的范围，对于这种情况，当前方法直接忽略，使用文本
        //    的实际长度代替请求的位置。

        let lastNode = treeWalker.currentNode;
        let lastNodeValue = lastNode.nodeValue;
        let lastNodeValueLength = (lastNodeValue === null) ? 0 : lastNode.nodeValue.length;
        let lastOffset = lastNodeValueLength; // exclude
        let lastNodeAndOffset = new NodeAndOffset(lastNode, lastOffset);

        // 上面的 lastOffset 是字符 **不包括** 的，所以不需要减去 1。
        // 至于为什么要设定为字符不包括，因为当前方法主要用来获取一对光标/位置然后
        // 用于构建一个 DOM Range，对于 Range，第 2 个位置是字符不包含的。

        nodeAndOffsets.push(lastNodeAndOffset);

        // 如果到这里还有未搜索的 TextSelection，应该是它们的范围超出了
        // 文本的长度，直接忽略它们即可。
        return nodeAndOffsetGroups;
    }

    /**
     * 更新 Node，整体或者部分
     *
     * @param {*} node 目标 Node
     * @param {*} startOffset 开始位置偏移值（索引包括）
     * @param {*} endOffset 结束位置偏移值（索引不包括）
     * @returns 返回受到影响的或者新建的 Text Node 容器元素
     */
    _applyToNode(node, startOffset, endOffset) {
        let affectedNodes = [];

        if (startOffset === endOffset) {
            // 开始和结束位置一样，不需要作任何更新
            return affectedNodes;
        }

        let nodeValue = node.nodeValue;
        if (startOffset === 0 && endOffset === nodeValue.length) {
            // 整个 Node 都需要更新
            let affectedNode = this._applyToWholeNode(node);
            affectedNodes.push(affectedNode);

        } else {
            let parentNode = node.parentNode;

            if (startOffset === 0) {
                // 只有前半部分 Node 需要更新

                // 创建一个装载 Node 前半部分内容的容器元素
                let headNodeContainer = this.documentObject.createElement('span');
                headNodeContainer.classList.add(this.className);

                let headNodeValue = nodeValue.substring(startOffset, endOffset);
                // https://developer.mozilla.org/en-US/docs/Web/API/Document/createTextNode
                let headTextNode = this.documentObject.createTextNode(headNodeValue);
                headNodeContainer.appendChild(headTextNode);
                parentNode.insertBefore(headNodeContainer, node);

                affectedNodes.push(headNodeContainer);

                // 更新原 Node 后半部分的文本内容
                let originalTextNodeValueRemain = nodeValue.substring(endOffset, nodeValue.length);
                node.nodeValue = originalTextNodeValueRemain;

            } else {
                // 中间或者后半部分需要更新

                // 先更新前半部分 Node 的文本内容
                let headNodeValue = nodeValue.substring(0, startOffset);
                node.nodeValue = headNodeValue;

                // nextSibling 属性有可能返回 null，正好给 insertBefore() 函数使用
                let nextSiblingNode = node.nextSibling;

                // 创建中间部分 Text Node 的容器元素
                let middleNodeContainer = this.documentObject.createElement('span');
                middleNodeContainer.classList.add(this.className);

                let middleNodeValue = nodeValue.substring(startOffset, endOffset);
                // https://developer.mozilla.org/en-US/docs/Web/API/Document/createTextNode
                let middleTextNode = this.documentObject.createTextNode(middleNodeValue);
                middleNodeContainer.appendChild(middleTextNode);
                parentNode.insertBefore(middleNodeContainer, nextSiblingNode);

                affectedNodes.push(middleNodeContainer);

                // 检查是否存在剩余的部分 Node
                if (endOffset < nodeValue.length) {
                    // 创建尾部 Text Node
                    let tailTextNodeValue = nodeValue.substring(endOffset, nodeValue.length);
                    let tailTextNode = this.documentObject.createTextNode(tailTextNodeValue);
                    parentNode.insertBefore(tailTextNode, nextSiblingNode);
                }
            }
        }

        return affectedNodes;
    }

    /**
     * 更新整个 Node
     *
     * @param {*} node
     * @returns
     */
    _applyToWholeNode(node) {
        let parentNode = node.parentNode;
        let affectedNode = null;

        // https://developer.mozilla.org/en-US/docs/Web/API/Node/childNodes
        // https://developer.mozilla.org/en-US/docs/Web/API/NodeList
        if (parentNode.childNodes.length === 1) {
            // Node 的父节点只有当前这个子节点，
            // 所以只需往父节点添加指定 class name 即完成任务。
            parentNode.classList.add(this.className);
            affectedNode = parentNode;

        } else {
            // Node 的父节点还有其他 Node，需要将当前 Text Node 放在容器里。
            //
            // 考虑如下情况：
            // <div class="root">
            // <span class="style1">foo</span>
            // hello world
            // <span class="style1">bar</span>
            // </div>
            //
            // 当需要风格化中间的 "hello world" 时，就会来到这里。

            // 创建当前 Text Node 的容器元素
            // https://developer.mozilla.org/en-US/docs/Web/API/Document/createElement
            // https://developer.mozilla.org/en-US/docs/Web/API/Node/appendChild
            // https://developer.mozilla.org/en-US/docs/Web/API/Node/insertBefore
            let textNodeContainer = this.documentObject.createElement('span');
            textNodeContainer.classList.add(this.className);

            // 把容器元素插入到原先 Node 的地方。
            parentNode.insertBefore(textNodeContainer, node);

            // 将当前 Text Node 移动到容器里
            textNodeContainer.appendChild(node);

            affectedNode = textNodeContainer;
        }

        return affectedNode;
    }

    /**
     * 移除所有元素当前风格器指定的 class name
     *
     * @returns 返回受影响的元素的个数，如果没有元素受到影响，则返回 0。
     */
    clear() {
        // see also:
        // https://developer.mozilla.org/en-US/docs/Web/API/Element/querySelectorAll
        // https://developer.mozilla.org/en-US/docs/Web/API/NodeList
        let spanElementList = this.rootElement.querySelectorAll('span.' + this.className);
        let spanElementCount = spanElementList.length;
        for (let idx = spanElementCount - 1; idx >= 0; idx--) {
            this.clearElement(spanElementList[idx]);
        }

        return spanElementCount;
    }

    /**
     * 移除指定元素的指定 class name
     *
     * @param {*} element
     */
    clearElement(element) {
        // element 有可能只有一个 class name，也可能有多个 class name。
        //
        // - 只有一个 class name 时，将 span 之内的文本移出，然后删除 span 元素，
        //   比如：
        //   <span class="parent"><span class="style1">Hello</span></span>
        //   变为
        //   <span class="parent">Hello</span>
        //
        // - 有多个 class name 时，只移除当前风格器指定的 class name，
        //   比如：
        //   <span class="parent"><span class="style1 other-style">Hello</span></span>
        //   变为
        //   <span class="parent"><span class="other-style">Hello</span></span>

        if (element.className === this.className &&
            element.childNodes.length === 1 &&
            element.firstChild.nodeType === Node.TEXT_NODE) {
            // 只有一个 class name，移出文本，移除 span 元素

            let parentNode = element.parentNode;
            // https://developer.mozilla.org/en-US/docs/Web/API/Node/firstChild
            let textNode = element.firstChild;

            parentNode.insertBefore(textNode, element);
            parentNode.removeChild(element);

            // 合并前后 text node
            let previousSiblingNode = textNode.previousSibling;
            if (previousSiblingNode !== null && previousSiblingNode.nodeType === Node.TEXT_NODE) {
                textNode.nodeValue = previousSiblingNode.nodeValue + textNode.nodeValue;
                parentNode.removeChild(previousSiblingNode);
            }

            let nextSiblingNode = textNode.nextSibling;
            if (nextSiblingNode !== null && nextSiblingNode.nodeType === Node.TEXT_NODE) {
                textNode.nodeValue += nextSiblingNode.nodeValue;
                parentNode.removeChild(nextSiblingNode);
            }

        } else {
            // 有多个 class name，只移除当前风格器指定的 class name
            element.classList.remove(this.className);
        }
    }

}

module.exports = TextStylization;