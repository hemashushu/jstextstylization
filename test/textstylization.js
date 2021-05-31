const assert = require('assert/strict');
const domino = require('domino');
const NodeFilter = require('domino/lib/NodeFilter');

const { TextSelection } = require('jstextselection');
const { TextStylization } = require('../index');

describe('TextStylization Test', () => {

    let createDocumentObject = () => {
        let doc1 = domino.createDocument(
            '<div>0123456789abcdefghij</div>', true);
        //    01234567890123456789

        return doc1;
    };

    it('Test applyToRanges() - one style', () => {
        let documentObject = createDocumentObject();
        let rootElement = documentObject.body.firstElementChild;

        let ts1 = new TextStylization(rootElement, 'foo', documentObject, NodeFilter);

        // apply to 1 TextSelection
        let textSelection1 = new TextSelection(3, 6); // '345'
        ts1.applyToRanges([textSelection1]);
        assert.equal(rootElement.outerHTML, '<div>012<span class="foo">345</span>6789abcdefghij</div>');

        // apply to multiple TextSelections
        let textSelection2 = new TextSelection(0, 2); // '01'
        let textSelection3 = new TextSelection(7, 11); // '789a'
        let textSelection4 = new TextSelection(14, 20); // 'efghij'
        ts1.applyToRanges([textSelection2, textSelection3, textSelection4]);

        assert.equal(rootElement.outerHTML,
            '<div><span class="foo">01</span>2<span class="foo">345</span>6' +
            '<span class="foo">789a</span>bcd<span class="foo">efghij</span></div>');
    });

    it('Test applyToRanges() - multiple style', () => {
        let documentObject = createDocumentObject();
        let rootElement = documentObject.body.firstElementChild;

        // apply 'foo' style
        let ts1 = new TextStylization(rootElement, 'foo', documentObject, NodeFilter);
        let textSelection1 = new TextSelection(5, 16); // '56789abcdef'
        ts1.applyToRanges([textSelection1]);
        assert.equal(rootElement.outerHTML,
            '<div>01234<span class="foo">56789abcdef</span>ghij</div>');

        let ts2 = new TextStylization(rootElement, 'bar', documentObject, NodeFilter);
        let textSelection2 = new TextSelection(5, 8); // '567'
        ts2.applyToRanges([textSelection2]);
        assert.equal(rootElement.outerHTML,
            '<div>01234<span class="foo"><span class="bar">567</span>' +
            '89abcdef</span>ghij</div>');

        let textSelection3 = new TextSelection(10, 13); // 'abc'
        ts2.applyToRanges([textSelection3]);
        assert.equal(rootElement.outerHTML,
            '<div>01234<span class="foo"><span class="bar">567</span>' +
            '89<span class="bar">abc</span>def</span>ghij</div>');

        let textSelection4 = new TextSelection(13, 16); // 'def'
        ts2.applyToRanges([textSelection4]);
        assert.equal(rootElement.outerHTML,
            '<div>01234<span class="foo"><span class="bar">567</span>' +
            '89<span class="bar">abc</span><span class="bar">def</span></span>ghij</div>');
    });

    it('Test applyToRanges() - cross style', () => {
        let documentObject = createDocumentObject();
        let rootElement = documentObject.body.firstElementChild;

        // apply 'foo' style
        let ts1 = new TextStylization(rootElement, 'foo', documentObject, NodeFilter);
        let textSelection1 = new TextSelection(5, 13); // '56789abc'
        ts1.applyToRanges([textSelection1]);
        assert.equal(rootElement.outerHTML,
            '<div>01234<span class="foo">56789abc</span>defghij</div>');

        let ts2 = new TextStylization(rootElement, 'bar', documentObject, NodeFilter);
        let textSelection2 = new TextSelection(10, 16); // 'abcdef'
        ts2.applyToRanges([textSelection2]);
        assert.equal(rootElement.outerHTML,
            '<div>01234<span class="foo">56789<span class="bar">abc</span></span>' +
            '<span class="bar">def</span>ghij</div>');
    });
});
