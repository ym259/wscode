/* eslint-disable @typescript-eslint/no-explicit-any */
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

export class DocxReader {
    private parser: XMLParser;
    private stylesMap: Record<string, any> = {};
    private commentsMap: Record<string, { id: string; author: string; initials: string; date: string; content: string }> = {};
    private docDefaults: any = null;
    // Track comment range positions: commentId -> { startFound: boolean, endFound: boolean }
    private activeCommentRanges: Set<string> = new Set();
    // Numbering definitions: numId -> level definitions
    private numberingMap: Record<string, {
        abstractNumId: string;
        levels: Record<number, {
            numFmt: string;
            lvlText: string;
            start: number;
            indent?: { left?: string; hanging?: string; firstLine?: string };
        }>;
    }> = {};

    constructor() {
        this.parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '',
            removeNSPrefix: false, // Keep prefixes to be explicit
        });
    }

    async load(buffer: ArrayBuffer | Uint8Array) {
        const zip = await JSZip.loadAsync(buffer);
        return this.loadFromZip(zip);
    }

    async loadFromZip(zip: JSZip) {
        // Load Styles
        const stylesXml = await zip.file('word/styles.xml')?.async('string');
        if (stylesXml) {
            this.parseStyles(stylesXml);
        }

        // Load Numbering (before document so we have numbering definitions ready)
        const numberingXml = await zip.file('word/numbering.xml')?.async('string');
        if (numberingXml) {
            this.parseNumbering(numberingXml);
        }

        // Load Comments (before document so we have comment content ready)
        const commentsXml = await zip.file('word/comments.xml')?.async('string');
        console.log('DEBUG load: comments.xml found:', !!commentsXml, commentsXml ? `length: ${commentsXml.length}` : '(null)');
        if (commentsXml) {
            this.parseComments(commentsXml);
            console.log('DEBUG load: commentsMap after parseComments:', JSON.stringify(this.commentsMap));
        }

        // Load Document
        const documentXml = await zip.file('word/document.xml')?.async('string');
        if (!documentXml) {
            throw new Error('Invalid DOCX: standard document.xml not found');
        }

        return this.parseDocument(documentXml);
    }


    private parseStyles(xmlContent: string) {
        // Styles parsing doesn't need preserveOrder usually, simpler to use default object map
        // But to be safe with namespaces, let's just use the same parser instance or default
        const result = this.parser.parse(xmlContent);

        const stylesRoot = result['w:styles'] || result['styles'];
        if (!stylesRoot) return;

        // Extract docDefaults
        const defaults = stylesRoot['w:docDefaults'] || stylesRoot['docDefaults'];
        if (defaults) {
            this.docDefaults = {};

            const rPrDefault = defaults['w:rPrDefault'] || defaults['rPrDefault'];
            if (rPrDefault) {
                const rPr = rPrDefault['w:rPr'] || rPrDefault['rPr'];
                if (rPr) {
                    this.docDefaults.rFonts = rPr['w:rFonts'] || rPr['rFonts'];
                    this.docDefaults.sz = rPr['w:sz'] || rPr['sz'];
                    this.docDefaults.szCs = rPr['w:szCs'] || rPr['szCs'];
                    this.docDefaults.lang = rPr['w:lang'] || rPr['lang'];
                }
            }

            const pPrDefault = defaults['w:pPrDefault'] || defaults['pPrDefault'];
            if (pPrDefault) {
                const pPr = pPrDefault['w:pPr'] || pPrDefault['pPr'];
                if (pPr) {
                    const widowControl = pPr['w:widowControl'] || pPr['widowControl'];
                    if (widowControl) {
                        this.docDefaults.pPr = {
                            widowControl: widowControl['w:val'] || widowControl['val']
                        };
                    }
                }
            }
        }

        const styles = stylesRoot['w:style'] || stylesRoot['style'];
        // Handle single style vs array
        const styleArray = Array.isArray(styles) ? styles : (styles ? [styles] : []);

        styleArray.forEach((style: any) => {
            const styleId = style['w:styleId'] || style['styleId'];
            if (styleId) {
                const nameNode = style['w:name'] || style['name'];
                const type = style['w:type'] || style['type'];
                const pPr = style['w:pPr'] || style['pPr'];
                let indent: any = null;

                if (pPr) {
                    const ind = pPr['w:ind'] || pPr['ind'];
                    if (ind) {
                        indent = {
                            left: ind['w:left'] || ind['w:start'] || ind['left'] || ind['start'],
                            hanging: ind['w:hanging'] || ind['hanging'],
                            firstLine: ind['w:firstLine'] || ind['firstLine']
                        };
                    }
                }

                this.stylesMap[styleId] = {
                    name: nameNode?.['w:val'] || nameNode?.['val'],
                    type: type,
                    indent
                };
            }
        });
    }

    /**
     * Parse comments.xml to extract comment content
     * Comments are stored as: { id, author, initials, date, content }
     */
    private parseComments(xmlContent: string) {
        // Use orderly parser to handle DOCX XML structure correctly
        const orderlyParser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '',
            removeNSPrefix: false,
            preserveOrder: true,
        });

        const orderlyResult = orderlyParser.parse(xmlContent);
        console.log('DEBUG parseComments: orderlyResult', JSON.stringify(orderlyResult, null, 2));

        // Find comments root element
        const commentsRoot = orderlyResult.find((x: any) => x['w:comments'] || x['comments']);
        if (!commentsRoot) {
            console.log('DEBUG parseComments: No comments root found');
            return;
        }

        const commentsArray = commentsRoot['w:comments'] || commentsRoot['comments'] || [];
        console.log('DEBUG parseComments: commentsArray length', commentsArray.length);

        commentsArray.forEach((item: any) => {
            const key = Object.keys(item)[0];
            if (key === 'w:comment' || key === 'comment') {
                const commentContent = item[key];
                const attrs = item[':@'] || {};
                const id = attrs['w:id'] || attrs['id'];
                const author = attrs['w:author'] || attrs['author'] || 'Unknown';
                const initials = attrs['w:initials'] || attrs['initials'] || '';
                const date = attrs['w:date'] || attrs['date'] || '';

                // Extract text content from paragraphs inside the comment
                let content = '';
                commentContent.forEach((pItem: any) => {
                    const pKey = Object.keys(pItem)[0];
                    if (pKey === 'w:p' || pKey === 'p') {
                        const pContent = pItem[pKey];
                        pContent.forEach((rItem: any) => {
                            const rKey = Object.keys(rItem)[0];
                            if (rKey === 'w:r' || rKey === 'r') {
                                const rContent = rItem[rKey];
                                rContent.forEach((tItem: any) => {
                                    const tKey = Object.keys(tItem)[0];
                                    if (tKey === 'w:t' || tKey === 't') {
                                        const tContent = tItem[tKey];
                                        tContent.forEach((textItem: any) => {
                                            if (textItem['#text']) {
                                                content += textItem['#text'];
                                            }
                                        });
                                    }
                                });
                            }
                        });
                    }
                });

                if (id) {
                    this.commentsMap[id] = { id, author, initials, date, content };
                    console.log('DEBUG parseComments: Added comment', { id, author, content });
                }
            }
        });

        console.log('DEBUG parseComments: Final commentsMap', this.commentsMap);
    }

    /**
     * Parse numbering.xml to extract list numbering definitions
     * This maps numId -> abstractNumId -> level definitions (format, text pattern, indent)
     */
    private parseNumbering(xmlContent: string) {
        const orderlyParser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '',
            removeNSPrefix: false,
            preserveOrder: true,
        });

        const orderlyResult = orderlyParser.parse(xmlContent);

        // Find numbering root element
        const numberingRoot = orderlyResult.find((x: any) => x['w:numbering'] || x['numbering']);
        if (!numberingRoot) return;

        const numberingArray = numberingRoot['w:numbering'] || numberingRoot['numbering'] || [];

        // First pass: collect abstractNum definitions
        const abstractNumMap: Record<string, Record<number, {
            numFmt: string;
            lvlText: string;
            start: number;
            indent?: { left?: string; hanging?: string; firstLine?: string };
        }>> = {};

        numberingArray.forEach((item: any) => {
            const key = Object.keys(item)[0];

            // Parse abstractNum definitions
            if (key === 'w:abstractNum' || key === 'abstractNum') {
                const abstractNumContent = item[key];
                const attrs = item[':@'] || {};
                const abstractNumId = attrs['w:abstractNumId'] || attrs['abstractNumId'];

                if (!abstractNumId) return;

                const levels: Record<number, any> = {};

                abstractNumContent.forEach((lvlItem: any) => {
                    const lvlKey = Object.keys(lvlItem)[0];
                    if (lvlKey === 'w:lvl' || lvlKey === 'lvl') {
                        const lvlContent = lvlItem[lvlKey];
                        const lvlAttrs = lvlItem[':@'] || {};
                        const ilvl = parseInt(lvlAttrs['w:ilvl'] || lvlAttrs['ilvl'] || '0');

                        const levelDef: any = {
                            numFmt: 'decimal',
                            lvlText: '%1.',
                            start: 1
                        };

                        lvlContent.forEach((prop: any) => {
                            const propKey = Object.keys(prop)[0];
                            const propAttrs = prop[':@'] || {};

                            if (propKey === 'w:numFmt' || propKey === 'numFmt') {
                                levelDef.numFmt = propAttrs['w:val'] || propAttrs['val'] || 'decimal';
                            }
                            if (propKey === 'w:lvlText' || propKey === 'lvlText') {
                                levelDef.lvlText = propAttrs['w:val'] || propAttrs['val'] || '%1.';
                            }
                            if (propKey === 'w:start' || propKey === 'start') {
                                levelDef.start = parseInt(propAttrs['w:val'] || propAttrs['val'] || '1');
                            }
                            if (propKey === 'w:pPr' || propKey === 'pPr') {
                                const pPrContent = prop[propKey];
                                pPrContent.forEach((pPrItem: any) => {
                                    const pPrKey = Object.keys(pPrItem)[0];
                                    if (pPrKey === 'w:ind' || pPrKey === 'ind') {
                                        const indAttrs = pPrItem[':@'] || {};
                                        levelDef.indent = {
                                            left: indAttrs['w:left'] || indAttrs['left'],
                                            hanging: indAttrs['w:hanging'] || indAttrs['hanging'],
                                            firstLine: indAttrs['w:firstLine'] || indAttrs['firstLine']
                                        };
                                    }
                                });
                            }
                        });

                        levels[ilvl] = levelDef;
                    }
                });

                abstractNumMap[abstractNumId] = levels;
            }
        });

        // Second pass: map numId -> abstractNumId
        numberingArray.forEach((item: any) => {
            const key = Object.keys(item)[0];

            if (key === 'w:num' || key === 'num') {
                const numContent = item[key];
                const attrs = item[':@'] || {};
                const numId = attrs['w:numId'] || attrs['numId'];

                if (!numId) return;

                let abstractNumId: string | null = null;

                numContent.forEach((prop: any) => {
                    const propKey = Object.keys(prop)[0];
                    if (propKey === 'w:abstractNumId' || propKey === 'abstractNumId') {
                        const propAttrs = prop[':@'] || {};
                        abstractNumId = propAttrs['w:val'] || propAttrs['val'];
                    }
                });

                if (abstractNumId && abstractNumMap[abstractNumId]) {
                    this.numberingMap[numId] = {
                        abstractNumId,
                        levels: abstractNumMap[abstractNumId]
                    };
                }
            }
        });
    }

    private parseDocument(xmlContent: string) {
        // Use orderly parser for valid flow
        const orderlyParser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '',
            removeNSPrefix: false, // Keep prefixes to be explicit
            preserveOrder: true,
        });

        const orderlyResult = orderlyParser.parse(xmlContent);

        // precise finding of document root
        const docRoot = orderlyResult.find((x: any) => x['w:document'] || x['document']);
        if (!docRoot) throw new Error('Invalid XML structure: document root not found');

        const docObj = docRoot['w:document'] || docRoot['document'];

        // find body
        const bodyRoot = docObj.find((x: any) => x['w:body'] || x['body']);
        const bodyContent = bodyRoot ? (bodyRoot['w:body'] || bodyRoot['body']) : [];

        // Extract section properties (usually last element, or inside paragraphs)
        let sectPr: any = null;

        // Look for direct child w:sectPr
        const sectionNode = bodyContent.find((node: any) => node['w:sectPr'] || node['sectPr']);
        if (sectionNode) {
            sectPr = sectionNode['w:sectPr'] || sectionNode['sectPr'];
        }

        const rawChildren = bodyContent.flatMap((node: any) => {
            const key = Object.keys(node)[0];
            if (key === 'w:p' || key === 'p') {
                // Check if paragraph has section properties (section break)
                // Note: handling section breaks properly is complex, we just look for doc defaults here
                return this.parseParagraph(node[key]);
            }
            if (key === 'w:tbl' || key === 'tbl') return this.parseTable(node[key]);
            // Handle structured document tags (sdt)
            if (key === 'w:sdt' || key === 'sdt') return this.parseStructuredContent(node[key]);
            return [];
        });


        // NOTE: We no longer filter out empty paragraphs as they represent
        // intentional blank lines in the document and carry spacing attributes.
        // Previously this was: filteredChildren = rawChildren.filter(...)
        // which caused paragraphs and their spacing to be lost.

        // Process list paragraphs: attach numbering metadata and compute counter values
        // (Do NOT wrap in ol/ul - render as paragraphs with CSS counters)
        const children = this.processListParagraphs(rawChildren);

        const result: any = {
            type: 'doc',
            content: children
        };

        if (sectPr) {
            result.attrs = {};

            // Extract docGrid
            const docGrid = sectPr.find((x: any) => x['w:docGrid'] || x['docGrid']);
            if (docGrid) {
                result.attrs.docGrid = docGrid[':@'];
            }

            // Extract pageSize
            const pgSz = sectPr.find((x: any) => x['w:pgSz'] || x['pgSz']);
            if (pgSz) {
                result.attrs.pageSize = pgSz[':@'];
            }

            // Extract pageMargins
            const pgMar = sectPr.find((x: any) => x['w:pgMar'] || x['pgMar']);
            if (pgMar) {
                result.attrs.pageMargins = pgMar[':@'];
            }

            // Extract columns
            const cols = sectPr.find((x: any) => x['w:cols'] || x['cols']);
            if (cols) {
                result.attrs.cols = cols[':@'];
            }

            // Capture all children of sectPr to preserve headers, footers, etc.
            result.attrs.sectPrElements = sectPr.filter((x: any) => {
                const key = Object.keys(x)[0];
                return key !== ':@';
            });
        }

        if (this.docDefaults) {
            if (!result.attrs) result.attrs = {};
            result.attrs.docDefaults = this.docDefaults;
        }

        return result;
    }

    // Group consecutive list items into ordered/bullet lists with proper nesting
    private groupListItems(items: any[]): any[] {
        const result: any[] = [];

        // Stack to track active lists at each depth
        // Each entry: { list: the list node, ilvl: indent level, numId: numbering ID }
        const listStack: { list: any; ilvl: number; numId: string }[] = [];

        // Tracker for split lists: numId-ilvl -> current count
        const listTracker: Record<string, number> = {};

        const trackListItem = (numId: string, ilvl: number) => {
            const key = `${numId}-${ilvl}`;
            listTracker[key] = (listTracker[key] || 0) + 1;
            // Reset deeper levels for this numId
            Object.keys(listTracker).forEach(k => {
                if (k.startsWith(`${numId}-`)) {
                    const kLvl = parseInt(k.split('-')[1]);
                    if (kLvl > ilvl) {
                        delete listTracker[k];
                    }
                }
            });
        };

        const closeListsAboveLevel = (targetLevel: number) => {
            while (listStack.length > 0 && listStack[listStack.length - 1].ilvl > targetLevel) {
                listStack.pop();
            }
        };

        const getParentListItem = (): any | null => {
            if (listStack.length === 0) return null;
            const currentList = listStack[listStack.length - 1].list;
            if (currentList.content.length === 0) return null;
            return currentList.content[currentList.content.length - 1];
        };

        for (const item of items) {
            if (item.listInfo) {
                const { numId, ilvl, isOrdered, numFmt, lvlText, numIndent } = item.listInfo;

                trackListItem(numId, ilvl);
                const currentCount = listTracker[`${numId}-${ilvl}`];
                const startAttr = currentCount > 1 ? { start: currentCount } : {};
                // Include numFmt and lvlText for CSS styling
                const formatAttrs = numFmt ? { numFmt, lvlText } : {};
                const indentAttrs = numIndent ? { numIndent } : {};

                if (listStack.length > 0) {
                    const currentStackTop = listStack[listStack.length - 1];

                    if (ilvl > currentStackTop.ilvl) {
                        // Going deeper - create nested list inside the last list item
                        const parentItem = getParentListItem();
                        if (parentItem) {
                            // PRIORITIZE PARAGRAPH INDENT OVER NUMBERING INDENT
                            // If the item has explicit indentation, use it for the list structure
                            let overrideIndent = item.attrs.indent ? {
                                left: item.attrs.indent,
                                hanging: item.attrs.hanging,
                                firstLine: item.attrs.firstLine
                            } : null;

                            // Fallback to style-defined indentation if direct indent is missing
                            if (!overrideIndent && item.attrs.styleId) {
                                const styleDef = this.stylesMap[item.attrs.styleId];
                                if (styleDef && styleDef.indent) {
                                    overrideIndent = styleDef.indent;
                                }
                            }

                            const finalIndentAttrs = overrideIndent ? { numIndent: overrideIndent } : indentAttrs;

                            // If we used the paragraph indent for the list, remove it from the item to prevent double indentation
                            // Note: We only delete if it was a direct attribute. If it came from style, it's not on item.attrs anyway.
                            if (item.attrs.indent) {
                                delete item.attrs.indent;
                                delete item.attrs.hanging;
                                delete item.attrs.firstLine;
                            }

                            const newList = {
                                type: isOrdered ? 'orderedList' : 'bulletList',
                                attrs: { originalNumId: numId, level: ilvl, ...startAttr, ...formatAttrs, ...finalIndentAttrs },
                                content: []
                            };
                            parentItem.content.push(newList);
                            listStack.push({ list: newList, ilvl, numId });
                        }
                    } else if (ilvl < currentStackTop.ilvl) {
                        // Going back up - close lists until we find the right level
                        closeListsAboveLevel(ilvl);

                        // If we don't have a list at this level, create one
                        if (listStack.length === 0 || listStack[listStack.length - 1].ilvl !== ilvl) {
                            // PRIORITIZE PARAGRAPH INDENT OVER NUMBERING INDENT
                            let overrideIndent = item.attrs.indent ? {
                                left: item.attrs.indent,
                                hanging: item.attrs.hanging,
                                firstLine: item.attrs.firstLine
                            } : null;

                            if (!overrideIndent && item.attrs.styleId) {
                                const styleDef = this.stylesMap[item.attrs.styleId];
                                if (styleDef && styleDef.indent) {
                                    overrideIndent = styleDef.indent;
                                }
                            }

                            const finalIndentAttrs = overrideIndent ? { numIndent: overrideIndent } : indentAttrs;

                            if (item.attrs.indent) {
                                delete item.attrs.indent;
                                delete item.attrs.hanging;
                                delete item.attrs.firstLine;
                            }

                            const newList = {
                                type: isOrdered ? 'orderedList' : 'bulletList',
                                attrs: { originalNumId: numId, level: ilvl, ...startAttr, ...formatAttrs, ...finalIndentAttrs },
                                content: []
                            };
                            if (listStack.length === 0) {
                                result.push(newList);
                            } else {
                                const parentItem = getParentListItem();
                                if (parentItem) {
                                    parentItem.content.push(newList);
                                }
                            }
                            listStack.push({ list: newList, ilvl, numId });
                        }
                    } else if (currentStackTop.numId !== numId) {
                        // Same level but different list - close current and start new
                        closeListsAboveLevel(ilvl);

                        // PRIORITIZE PARAGRAPH INDENT OVER NUMBERING INDENT
                        let overrideIndent = item.attrs.indent ? {
                            left: item.attrs.indent,
                            hanging: item.attrs.hanging,
                            firstLine: item.attrs.firstLine
                        } : null;

                        if (!overrideIndent && item.attrs.styleId) {
                            const styleDef = this.stylesMap[item.attrs.styleId];
                            if (styleDef && styleDef.indent) {
                                overrideIndent = styleDef.indent;
                            }
                        }

                        const finalIndentAttrs = overrideIndent ? { numIndent: overrideIndent } : indentAttrs;

                        if (item.attrs.indent) {
                            delete item.attrs.indent;
                            delete item.attrs.hanging;
                            delete item.attrs.firstLine;
                        }

                        const newList = {
                            type: isOrdered ? 'orderedList' : 'bulletList',
                            attrs: { originalNumId: numId, level: ilvl, ...startAttr, ...formatAttrs, ...finalIndentAttrs },
                            content: []
                        };
                        if (listStack.length === 0) {
                            result.push(newList);
                        } else {
                            const parentItem = getParentListItem();
                            if (parentItem) {
                                parentItem.content.push(newList);
                            }
                        }
                        listStack.push({ list: newList, ilvl, numId });
                    }
                    // else: same level, same numId - continue adding to current list
                    else {
                        // Even for existing lists, we should strip the paragraph indent if it matches the list indent
                        // to avoid double indentation. Ideally, we would update the list indent if this item differs,
                        // but HTML lists can only have one indent.
                        // For now, if the item has indent, we remove it assuming the list handles it.
                        // CAUTION: If this item *different* indent than the list, removing it forces it to match the list.
                        // This corresponds to the user-approved trade-off.
                        if (item.attrs.indent) {
                            delete item.attrs.indent;
                            delete item.attrs.hanging;
                            delete item.attrs.firstLine;
                        }
                    }
                } else {
                    // No active list - start a new one at root level

                    // PRIORITIZE PARAGRAPH INDENT OVER NUMBERING INDENT
                    let overrideIndent = item.attrs.indent ? {
                        left: item.attrs.indent,
                        hanging: item.attrs.hanging,
                        firstLine: item.attrs.firstLine
                    } : null;

                    if (!overrideIndent && item.attrs.styleId) {
                        const styleDef = this.stylesMap[item.attrs.styleId];
                        if (styleDef && styleDef.indent) {
                            overrideIndent = styleDef.indent;
                        }
                    }

                    const finalIndentAttrs = overrideIndent ? { numIndent: overrideIndent } : indentAttrs;

                    if (item.attrs.indent) {
                        delete item.attrs.indent;
                        delete item.attrs.hanging;
                        delete item.attrs.firstLine;
                    }

                    const newList = {
                        type: isOrdered ? 'orderedList' : 'bulletList',
                        attrs: { originalNumId: numId, ...startAttr, ...formatAttrs, ...finalIndentAttrs },
                        content: []
                    };
                    result.push(newList);
                    listStack.push({ list: newList, ilvl, numId });
                }

                // Add the list item to the current list
                // Preserve original paragraph attrs (spacing, alignment, etc.)
                const listItem = {
                    type: 'listItem',
                    content: [{
                        type: 'paragraph',
                        attrs: item.attrs, // Preserve original paragraph attributes
                        content: item.content
                    }]
                };

                if (listStack.length > 0) {
                    listStack[listStack.length - 1].list.content.push(listItem);
                }
            } else {
                // Not a list item - close all active lists
                listStack.length = 0;
                result.push(item);
            }
        }

        return result;
    }

    /**
     * Process list paragraphs: attach numbering metadata and compute counter values.
     * Instead of wrapping in ol/ul, we keep paragraphs and use CSS counters for rendering.
     * This matches how Word internally handles list items (as styled paragraphs).
     */
    private processListParagraphs(items: any[]): any[] {
        // Counter tracker: numId -> ilvl -> current count
        const counterState: Record<string, Record<number, number>> = {};

        // Reset tracker: when we encounter a non-list item, reset counters for lists that have ended
        const activeNumIds = new Set<string>();

        const result: any[] = [];

        for (const item of items) {
            if (item.listInfo) {
                const { numId, ilvl, isOrdered, numFmt, lvlText, numIndent } = item.listInfo;

                // Initialize counter state for this numId if needed
                if (!counterState[numId]) {
                    counterState[numId] = {};
                }

                // Reset deeper levels when going back up
                for (const key of Object.keys(counterState[numId])) {
                    const level = parseInt(key);
                    if (level > ilvl) {
                        delete counterState[numId][level];
                    }
                }

                // Increment counter for this level
                counterState[numId][ilvl] = (counterState[numId][ilvl] || 0) + 1;
                const counterValue = counterState[numId][ilvl];

                activeNumIds.add(numId);

                // Generate the full marker text for special formats
                const markerText = this.generateMarkerText(numFmt || 'decimal', lvlText, counterValue);

                // Create paragraph with numbering metadata (no listItem wrapper)
                const paragraph = {
                    type: 'paragraph',
                    attrs: {
                        ...item.attrs,
                        // Numbering metadata
                        listNumId: numId,
                        listIlvl: ilvl,
                        listIsOrdered: isOrdered,
                        listNumFmt: numFmt || 'decimal',
                        listLvlText: lvlText,
                        listCounterValue: counterValue,
                        listMarkerText: markerText, // Pre-rendered marker for CSS content
                        // Indentation from numbering definition
                        listIndentLeft: numIndent?.left,
                        listIndentHanging: numIndent?.hanging,
                    },
                    content: item.content
                };

                result.push(paragraph);

                // Remove the temporary listInfo property
                delete item.listInfo;
            } else {
                // Non-list item - just pass through
                result.push(item);
            }
        }

        return result;
    }

    /**
     * Generate the full marker text for a list item.
     * Handles special formats like ideographTraditional (甲乙丙丁) that CSS can't generate.
     */
    private generateMarkerText(numFmt: string, lvlText: string | undefined, counterValue: number): string {
        // Heavenly Stems (天干) for ideographTraditional: 甲乙丙丁戊己庚辛壬癸
        const heavenlyStems = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

        // Earthly Branches (地支) for some other formats: 子丑寅卯辰巳午未申酉戌亥
        // const earthlyBranches = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

        let baseMarker: string;

        switch (numFmt) {
            case 'ideographTraditional':
                // Use Heavenly Stems: 甲, 乙, 丙, 丁, 戊, 己, 庚, 辛, 壬, 癸
                baseMarker = heavenlyStems[(counterValue - 1) % heavenlyStems.length] || String(counterValue);
                break;
            case 'upperRoman':
                baseMarker = this.toRoman(counterValue).toUpperCase();
                break;
            case 'lowerRoman':
                baseMarker = this.toRoman(counterValue).toLowerCase();
                break;
            case 'upperLetter':
                baseMarker = String.fromCharCode(64 + ((counterValue - 1) % 26) + 1);
                break;
            case 'lowerLetter':
                baseMarker = String.fromCharCode(96 + ((counterValue - 1) % 26) + 1);
                break;
            case 'decimalFullWidth':
                // Convert to full-width digits: １２３４５
                baseMarker = String(counterValue).split('').map(d => String.fromCharCode(0xFF10 + parseInt(d))).join('');
                break;
            case 'decimal':
            default:
                baseMarker = String(counterValue);
                break;
        }

        // Apply lvlText template if present
        if (lvlText) {
            // Replace %1, %2, etc. with the marker value
            // For now, just handle %1 (single level)
            return lvlText.replace(/%1/g, baseMarker);
        }

        return baseMarker;
    }

    /**
     * Convert number to Roman numerals
     */
    private toRoman(num: number): string {
        const romanNumerals: [number, string][] = [
            [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
            [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
            [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']
        ];
        let result = '';
        for (const [value, numeral] of romanNumerals) {
            while (num >= value) {
                result += numeral;
                num -= value;
            }
        }
        return result;
    }

    // Parse structured document tags (w:sdt) by extracting content from w:sdtContent
    private parseStructuredContent(sdtContent: any[]): any[] {
        const results: any[] = [];

        for (const item of sdtContent) {
            const key = Object.keys(item)[0];

            // Look for sdtContent which contains the actual content
            if (key === 'w:sdtContent' || key === 'sdtContent') {
                const contentItems = item[key];
                if (Array.isArray(contentItems)) {
                    for (const contentItem of contentItems) {
                        const contentKey = Object.keys(contentItem)[0];
                        if (contentKey === 'w:p' || contentKey === 'p') {
                            results.push(...this.parseParagraph(contentItem[contentKey]));
                        } else if (contentKey === 'w:tbl' || contentKey === 'tbl') {
                            results.push(this.parseTable(contentItem[contentKey]));
                        } else if (contentKey === 'w:sdt' || contentKey === 'sdt') {
                            // Nested sdt
                            results.push(...this.parseStructuredContent(contentItem[contentKey]));
                        } else if (contentKey === 'w:r' || contentKey === 'r') {
                            // Handle runs directly inside sdtContent (without wrapping paragraph)
                            const runNodes = this.parseRun(contentItem[contentKey]);
                            if (runNodes.length > 0) {
                                results.push({
                                    type: 'paragraph',
                                    content: runNodes
                                });
                            }
                        } else if (contentKey === 'w:ins' || contentKey === 'ins') {
                            // Handle Track Changes Insertions inside SDT
                            const insContent = contentItem[contentKey];
                            if (Array.isArray(insContent)) {
                                const runNodes: any[] = [];
                                for (const child of insContent) {
                                    const k = Object.keys(child)[0];
                                    if (k === 'w:p' || k === 'p') {
                                        results.push(...this.parseParagraph(child[k]));
                                    } else if (k === 'w:r' || k === 'r') {
                                        runNodes.push(...this.parseRun(child[k]));
                                    }
                                }
                                if (runNodes.length > 0) {
                                    results.push({
                                        type: 'paragraph',
                                        content: runNodes
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        return results;
    }

    private parseParagraph(nodeContent: any[]): any[] {
        const attrs: any = {};
        const children: any[] = [];
        // Track active comment IDs for this paragraph
        const activeCommentIds: string[] = [];
        let hasPageBreak = false;
        // Paragraph default run properties (from w:pPr/w:rPr)
        // Initialize with document-level defaults from docDefaults
        const paragraphDefaults: { fontSize?: string; fontFamily?: string } = {};

        // Apply document default font size if available (w:sz value in half-points)
        if (this.docDefaults?.sz) {
            const szVal = this.docDefaults.sz['w:val'] || this.docDefaults.sz['val'];
            if (szVal) {
                paragraphDefaults.fontSize = `${parseInt(szVal) / 2}pt`;
            }
        }

        // First pass: extract paragraph defaults from w:pPr/w:rPr
        nodeContent.forEach(item => {
            const keys = Object.keys(item);
            const pPrKey = keys.find(k => k === 'w:pPr' || k === 'pPr');
            if (pPrKey) {
                const pPr = item[pPrKey];
                pPr.forEach((prop: any) => {
                    const propKey = Object.keys(prop)[0];
                    // Look for rPr inside pPr (paragraph default run properties)
                    if (propKey === 'w:rPr' || propKey === 'rPr') {
                        const rPr = prop[propKey];
                        rPr.forEach((rProp: any) => {
                            const rPropKey = Object.keys(rProp)[0];
                            // Font size
                            if (rPropKey === 'w:sz' || rPropKey === 'sz') {
                                const val = rProp[':@']?.['w:val'] || rProp[':@']?.['val'];
                                if (val) paragraphDefaults.fontSize = `${parseInt(val) / 2}pt`;
                            }
                            // Font family
                            if (rPropKey === 'w:rFonts' || rPropKey === 'rFonts') {
                                const eastAsia = rProp[':@']?.['w:eastAsia'] || rProp[':@']?.['eastAsia'];
                                const ascii = rProp[':@']?.['w:ascii'] || rProp[':@']?.['ascii'];
                                if (eastAsia) paragraphDefaults.fontFamily = eastAsia;
                                else if (ascii) paragraphDefaults.fontFamily = ascii;
                            }
                        });
                    }
                });
            }
        });

        // Store paragraph defaults as attrs for serialization
        if (paragraphDefaults.fontSize) {
            attrs.pPrFontSize = paragraphDefaults.fontSize;
        }
        if (paragraphDefaults.fontFamily) {
            attrs.pPrFontFamily = paragraphDefaults.fontFamily;
        }

        nodeContent.forEach(item => {
            const keys = Object.keys(item);
            const pPrKey = keys.find(k => k === 'w:pPr' || k === 'pPr');
            const rKey = keys.find(k => k === 'w:r' || k === 'r');

            // Comment Range Start: w:commentRangeStart
            const commentStartKey = keys.find(k => k === 'w:commentRangeStart' || k === 'commentRangeStart');
            if (commentStartKey) {
                const commentId = item[':@']?.['w:id'] || item[':@']?.['id'];
                console.log('DEBUG parseParagraph: Found commentRangeStart', { commentId, attrs: item[':@'], keys });
                if (commentId && !activeCommentIds.includes(commentId)) {
                    activeCommentIds.push(commentId);
                    console.log('DEBUG parseParagraph: Added to activeCommentIds', activeCommentIds);
                }
            }

            // Comment Range End: w:commentRangeEnd
            const commentEndKey = keys.find(k => k === 'w:commentRangeEnd' || k === 'commentRangeEnd');
            if (commentEndKey) {
                const commentId = item[':@']?.['w:id'] || item[':@']?.['id'];
                console.log('DEBUG parseParagraph: Found commentRangeEnd', { commentId });
                if (commentId) {
                    const idx = activeCommentIds.indexOf(commentId);
                    if (idx !== -1) {
                        activeCommentIds.splice(idx, 1);
                    }
                }
            }

            if (pPrKey) {
                const pPr = item[pPrKey];
                pPr.forEach((prop: any) => {
                    const propKeys = Object.keys(prop);
                    const propKey = propKeys[0]; // Usually only one key per prop object in pPr array

                    // Numbering Properties (List detection)
                    if (propKey === 'w:numPr' || propKey === 'numPr') {
                        const numPr = prop[propKey];
                        let numId: string | null = null;
                        let ilvl: string = '0';

                        numPr.forEach((numProp: any) => {
                            const numPropKey = Object.keys(numProp)[0];
                            if (numPropKey === 'w:numId' || numPropKey === 'numId') {
                                numId = numProp[':@']?.['w:val'] || numProp[':@']?.['val'];
                            }
                            if (numPropKey === 'w:ilvl' || numPropKey === 'ilvl') {
                                ilvl = numProp[':@']?.['w:val'] || numProp[':@']?.['val'] || '0';
                            }
                        });

                        if (numId) {
                            // Look up numbering definitions for proper format
                            const numDef = this.numberingMap[numId];
                            const level = parseInt(ilvl);
                            const levelDef = numDef?.levels?.[level];

                            // Determine if ordered based on numFmt
                            const numFmt = levelDef?.numFmt || 'decimal';
                            const isOrdered = numFmt !== 'bullet' && numFmt !== 'none';

                            attrs.listInfo = {
                                numId,
                                ilvl: level,
                                isOrdered,
                                // Include numbering format details for rendering
                                numFmt: levelDef?.numFmt,
                                lvlText: levelDef?.lvlText,
                                start: levelDef?.start,
                                // Include indent from numbering definition if not overridden
                                numIndent: levelDef?.indent
                            };
                        }
                    }

                    // Style
                    if (propKey === 'w:pStyle' || propKey === 'pStyle') {
                        const val = prop[':@']?.['w:val'] || prop[':@']?.['val'];
                        if (val) {
                            // Store original style ID for roundtrip preservation
                            attrs.styleId = val;

                            const styleDef = this.stylesMap[val];
                            // Check 1: Style Name (e.g. "Heading 1")
                            if (styleDef && styleDef.name && styleDef.name.toLowerCase().startsWith('heading')) {
                                const level = parseInt(styleDef.name.split(' ')[1]);
                                if (!isNaN(level)) attrs.level = level;
                            }
                            // Check 2: Style ID (e.g. "Heading1", "Heading2") - case insensitive check
                            else {
                                const lowerVal = val.toLowerCase();
                                if (lowerVal.startsWith('heading')) {
                                    const levelStr = lowerVal.replace('heading', '');
                                    const level = parseInt(levelStr);
                                    if (!isNaN(level) && level >= 1 && level <= 6) {
                                        attrs.level = level;
                                    }
                                }
                                // Check for list styles
                                if (lowerVal.includes('listparagraph') || lowerVal.includes('list')) {
                                    // Mark as potential list item if not already detected via numPr
                                    if (!attrs.listInfo) {
                                        attrs.listInfo = {
                                            numId: 'style-' + val,
                                            ilvl: 0,
                                            isOrdered: !lowerVal.includes('bullet')
                                        };
                                    }
                                }
                            }
                        }
                    }

                    // Alignment
                    if (propKey === 'w:jc' || propKey === 'jc') {
                        const val = prop[':@']?.['w:val'] || prop[':@']?.['val'];
                        if (val) attrs.textAlign = val;
                    }

                    // Indent
                    if (propKey === 'w:ind' || propKey === 'ind') {
                        const left = prop[':@']?.['w:left'] || prop[':@']?.['left'];
                        const hanging = prop[':@']?.['w:hanging'] || prop[':@']?.['hanging'];
                        const firstLine = prop[':@']?.['w:firstLine'] || prop[':@']?.['firstLine'];

                        if (left) attrs.indent = left;
                        if (hanging) attrs.hanging = hanging;
                        if (firstLine) attrs.firstLine = firstLine;
                    }

                    // Spacing
                    if (propKey === 'w:spacing' || propKey === 'spacing') {
                        const line = prop[':@']?.['w:line'] || prop[':@']?.['line'];
                        const before = prop[':@']?.['w:before'] || prop[':@']?.['before'];
                        const after = prop[':@']?.['w:after'] || prop[':@']?.['after'];
                        const lineRule = prop[':@']?.['w:lineRule'] || prop[':@']?.['lineRule'];
                        if (line) attrs.lineHeight = line; // Needs conversion usually, but storing raw for now
                        if (before) attrs.spacingBefore = before;
                        if (after) attrs.spacingAfter = after;
                        if (lineRule) attrs.lineRule = lineRule;
                    }

                    // Contextual Spacing
                    if (propKey === 'w:contextualSpacing' || propKey === 'contextualSpacing') {
                        const val = prop[':@']?.['w:val'] || prop[':@']?.['val'];
                        if (val) attrs.contextualSpacing = val;
                    }

                    // Snap to Grid
                    if (propKey === 'w:snapToGrid' || propKey === 'snapToGrid') {
                        const val = prop[':@']?.['w:val'] || prop[':@']?.['val'];
                        if (val) attrs.snapToGrid = val;
                    }

                    // Keep Next (prevents page break between this and next paragraph)
                    if (propKey === 'w:keepNext' || propKey === 'keepNext') {
                        const val = prop[':@']?.['w:val'] || prop[':@']?.['val'];
                        // w:keepNext without val means true, w:keepNext w:val="0" means false
                        attrs.keepNext = val === '0' ? '0' : '1';
                    }

                    // Keep Lines (prevents page break within paragraph)
                    if (propKey === 'w:keepLines' || propKey === 'keepLines') {
                        const val = prop[':@']?.['w:val'] || prop[':@']?.['val'];
                        attrs.keepLines = val === '0' ? '0' : '1';
                    }

                    // Shading (Background)
                    if (propKey === 'w:shd' || propKey === 'shd') {
                        const fill = prop[':@']?.['w:fill'] || prop[':@']?.['fill'];
                        if (fill && fill !== 'auto') attrs.backgroundColor = `#${fill}`;
                    }

                    // Section Properties (SectPr) - Check for Section Break
                    if (propKey === 'w:sectPr' || propKey === 'sectPr') {
                        const sectPr = prop[propKey];
                        // check w:type
                        let type = 'nextPage'; // Default if not specified

                        // sectPr is typically an array of props in this parser structure
                        if (Array.isArray(sectPr)) {
                            const typeNode = sectPr.find((x: any) => x['w:type'] || x['type']);
                            if (typeNode) {
                                type = typeNode[':@']?.['w:val'] || typeNode[':@']?.['val'] || 'nextPage';
                            }
                        }

                        if (type !== 'continuous') {
                            hasPageBreak = true;
                        }
                    }
                });
            }

            if (rKey) {
                // Pass active comment IDs to parseRun
                const runNodes = this.parseRun(item[rKey], undefined, activeCommentIds.length > 0 ? [...activeCommentIds] : undefined, Object.keys(paragraphDefaults).length > 0 ? paragraphDefaults : undefined);
                children.push(...runNodes);
            }

            // Track Changes: Insertions (w:ins)
            const insKey = keys.find(k => k === 'w:ins' || k === 'ins');
            if (insKey) {
                const insContent = item[insKey];
                const insAttrs = item[':@'] || {};
                const author = insAttrs['w:author'] || insAttrs['author'] || 'Unknown';
                const date = insAttrs['w:date'] || insAttrs['date'] || '';

                // Parse runs inside the insertion
                insContent.forEach((insItem: any) => {
                    const insItemKeys = Object.keys(insItem);
                    const insRKey = insItemKeys.find(k => k === 'w:r' || k === 'r');
                    if (insRKey) {
                        const runNodes = this.parseRun(insItem[insRKey], {
                            type: 'insertion',
                            author,
                            date
                        }, activeCommentIds.length > 0 ? [...activeCommentIds] : undefined, Object.keys(paragraphDefaults).length > 0 ? paragraphDefaults : undefined);
                        children.push(...runNodes);
                    }
                });
            }

            // Track Changes: Deletions (w:del)
            const delKey = keys.find(k => k === 'w:del' || k === 'del');
            if (delKey) {
                const delContent = item[delKey];
                const delAttrs = item[':@'] || {};
                const author = delAttrs['w:author'] || delAttrs['author'] || 'Unknown';
                const date = delAttrs['w:date'] || delAttrs['date'] || '';

                // Parse runs inside the deletion
                delContent.forEach((delItem: any) => {
                    const delItemKeys = Object.keys(delItem);
                    const delRKey = delItemKeys.find(k => k === 'w:r' || k === 'r');
                    if (delRKey) {
                        const runNodes = this.parseRun(delItem[delRKey], {
                            type: 'deletion',
                            author,
                            date
                        }, activeCommentIds.length > 0 ? [...activeCommentIds] : undefined, Object.keys(paragraphDefaults).length > 0 ? paragraphDefaults : undefined);
                        children.push(...runNodes);
                    }
                });
            }

            // Handle inline structured document tags (w:sdt) within paragraphs
            const sdtKey = keys.find(k => k === 'w:sdt' || k === 'sdt');
            if (sdtKey) {
                const sdtContent = item[sdtKey];
                // Recursively extract runs from inline sdt
                const extractInlineSdtRuns = (sdtItems: any[]): void => {
                    for (const sdtItem of sdtItems) {
                        const sdtItemKey = Object.keys(sdtItem)[0];
                        if (sdtItemKey === 'w:sdtContent' || sdtItemKey === 'sdtContent') {
                            const contentItems = sdtItem[sdtItemKey];
                            if (Array.isArray(contentItems)) {
                                for (const contentItem of contentItems) {
                                    const contentKey = Object.keys(contentItem)[0];
                                    // Parse runs
                                    if (contentKey === 'w:r' || contentKey === 'r') {
                                        const runNodes = this.parseRun(contentItem[contentKey]);
                                        children.push(...runNodes);
                                    }
                                    // Recursively handle nested sdt
                                    else if (contentKey === 'w:sdt' || contentKey === 'sdt') {
                                        extractInlineSdtRuns(contentItem[contentKey]);
                                    }
                                    // Handle insertions inside inline sdt
                                    else if (contentKey === 'w:ins' || contentKey === 'ins') {
                                        const insContent = contentItem[contentKey];
                                        const insAttrs = contentItem[':@'] || {};
                                        const author = insAttrs['w:author'] || insAttrs['author'] || 'Unknown';
                                        const date = insAttrs['w:date'] || insAttrs['date'] || '';
                                        insContent.forEach((insItem: any) => {
                                            const insItemKey = Object.keys(insItem)[0];
                                            if (insItemKey === 'w:r' || insItemKey === 'r') {
                                                const runNodes = this.parseRun(insItem[insItemKey], {
                                                    type: 'insertion', author, date
                                                });
                                                children.push(...runNodes);
                                            }
                                        });
                                    }
                                    // Handle deletions inside inline sdt
                                    else if (contentKey === 'w:del' || contentKey === 'del') {
                                        const delContent = contentItem[contentKey];
                                        const delAttrs = contentItem[':@'] || {};
                                        const author = delAttrs['w:author'] || delAttrs['author'] || 'Unknown';
                                        const date = delAttrs['w:date'] || delAttrs['date'] || '';
                                        delContent.forEach((delItem: any) => {
                                            const delItemKey = Object.keys(delItem)[0];
                                            if (delItemKey === 'w:r' || delItemKey === 'r') {
                                                const runNodes = this.parseRun(delItem[delItemKey], {
                                                    type: 'deletion', author, date
                                                });
                                                children.push(...runNodes);
                                            }
                                        });
                                    }
                                }
                            }
                        }
                    }
                };
                extractInlineSdtRuns(sdtContent);
            }
        });


        const validChildren = children.filter(c => c);

        // IMPORTANT: For roundtrip fidelity, all DOCX paragraphs should remain as 'paragraph' type.
        // The original document uses <w:p> elements with <w:pStyle> to apply heading styles.
        // We preserve the styleId for serialization, but keep the node type as 'paragraph'.
        // This ensures the exported document has the same structure as the original.
        // If we convert to 'heading' type, the serializer would use serializeHeading() which
        // may produce different XML structure than the original paragraph.
        // UPDATE: User confirmed they want 'heading' type if it resolves to a heading level.
        const finalType = attrs.level !== undefined ? 'heading' : 'paragraph';

        // If this is a list item, include listInfo for grouping
        const result: any = {
            type: finalType,
            attrs,
            content: validChildren.length ? validChildren : undefined
        };

        if (attrs.listInfo) {
            result.listInfo = attrs.listInfo;
            delete result.attrs.listInfo; // Don't include in attrs sent to TipTap
        }

        const nodes = [result];

        // Append Page Break if Section Break was found
        if (hasPageBreak) {
            nodes.push({ type: 'pageBreak' });
        }

        return nodes;
    }

    private parseRun(
        runContent: any[],
        trackChange?: { type: 'insertion' | 'deletion'; author: string; date: string },
        commentIds?: string[],
        paragraphDefaults?: { fontSize?: string; fontFamily?: string }
    ): any[] {
        const nodes: any[] = [];
        let currentText = '';
        const marks: any[] = [];

        // Add track change mark if this run is part of a tracked change
        if (trackChange) {
            marks.push({
                type: trackChange.type,
                attrs: {
                    author: trackChange.author,
                    date: trackChange.date
                }
            });
        }

        // Add comment marks for each active comment
        if (commentIds && commentIds.length > 0) {
            for (const commentId of commentIds) {
                const comment = this.commentsMap[commentId];
                if (comment) {
                    marks.push({
                        type: 'comment',
                        attrs: {
                            commentId: comment.id,
                            author: comment.author,
                            date: comment.date,
                            content: comment.content
                        }
                    });
                }
            }
        }

        // First pass: collect marks from rPr
        // Start with paragraph defaults (from w:pPr/w:rPr), run-level properties will override
        const textStyleAttrs: any = {};
        if (paragraphDefaults?.fontSize) {
            textStyleAttrs.fontSize = paragraphDefaults.fontSize;
        }
        if (paragraphDefaults?.fontFamily) {
            textStyleAttrs.fontFamily = paragraphDefaults.fontFamily;
        }
        runContent.forEach(item => {
            const keys = Object.keys(item);
            const rPrKey = keys.find(k => k === 'w:rPr' || k === 'rPr');
            if (rPrKey) {
                const rPr = item[rPrKey];
                rPr.forEach((prop: any) => {
                    const pk = Object.keys(prop)[0];
                    if (pk === 'w:b' || pk === 'b') marks.push({ type: 'bold' });
                    if (pk === 'w:i' || pk === 'i') marks.push({ type: 'italic' });
                    if (pk === 'w:u' || pk === 'u') marks.push({ type: 'underline' });
                    if (pk === 'w:strike' || pk === 'strike') marks.push({ type: 'strike' });

                    // Color
                    if (pk === 'w:color' || pk === 'color') {
                        const val = prop[':@']?.['w:val'] || prop[':@']?.['val'];
                        if (val && val !== 'auto') textStyleAttrs.color = `#${val}`;
                    }

                    // Size (half-points)
                    if (pk === 'w:sz' || pk === 'sz') {
                        const val = prop[':@']?.['w:val'] || prop[':@']?.['val'];
                        if (val) textStyleAttrs.fontSize = `${parseInt(val) / 2}pt`;
                    }

                    // Highlight
                    if (pk === 'w:highlight' || pk === 'highlight') {
                        const val = prop[':@']?.['w:val'] || prop[':@']?.['val'];
                        if (val) marks.push({ type: 'highlight', attrs: { color: val } });
                    }

                    // Fonts
                    if (pk === 'w:rFonts' || pk === 'rFonts') {
                        const ascii = prop[':@']?.['w:ascii'] || prop[':@']?.['ascii'];
                        const eastAsia = prop[':@']?.['w:eastAsia'] || prop[':@']?.['eastAsia'];
                        const hAnsi = prop[':@']?.['w:hAnsi'] || prop[':@']?.['hAnsi'];
                        const cs = prop[':@']?.['w:cs'] || prop[':@']?.['cs'];

                        // Prioritize eastAsia for Japanese context, but fallback to ascii
                        if (eastAsia) textStyleAttrs.fontFamily = eastAsia;
                        else if (ascii) textStyleAttrs.fontFamily = ascii;
                        else if (hAnsi) textStyleAttrs.fontFamily = hAnsi;
                        else if (cs) textStyleAttrs.fontFamily = cs;
                    }
                });
            }
        });

        // Add the consolidated textStyle mark if any attributes were found
        if (Object.keys(textStyleAttrs).length > 0) {
            marks.push({ type: 'textStyle', attrs: textStyleAttrs });
        }

        // Helper to flush current text as a node
        const flushText = () => {
            if (currentText) {
                nodes.push({
                    type: 'text',
                    text: currentText,
                    marks: marks.length ? [...marks] : undefined
                });
                currentText = '';
            }
        };

        // Second pass: collect text and handle breaks
        runContent.forEach(item => {
            const keys = Object.keys(item);

            // Text: w:t (for normal runs) or w:delText (for deletions)
            const tKey = keys.find(k => k === 'w:t' || k === 't' || k === 'w:delText' || k === 'delText');
            if (tKey) {
                const tNode = item[tKey];
                tNode.forEach((tPart: any) => {
                    if (tPart['#text']) currentText += tPart['#text'];
                });
            }

            // Line breaks: w:br
            const brKey = keys.find(k => k === 'w:br' || k === 'br');
            if (brKey) {
                const brNode = item[brKey];
                const type = brNode[':@']?.['w:type'] || brNode[':@']?.['type'];

                flushText();

                if (type === 'page') {
                    nodes.push({ type: 'pageBreak' });
                } else {
                    nodes.push({ type: 'hardBreak' });
                }
            }
        });

        // Flush remaining text
        flushText();

        return nodes;
    }

    private parseTable(tblContent: any[]) {
        const rows: any[] = [];
        tblContent.forEach(item => {
            const trKey = Object.keys(item).find(k => k === 'w:tr' || k === 'tr');
            if (trKey) {
                rows.push(this.parseTableRow(item[trKey]));
            }
        });

        return {
            type: 'table',
            content: rows
        };
    }

    private parseTableRow(trContent: any[]) {
        const cells: any[] = [];
        trContent.forEach(item => {
            const tcKey = Object.keys(item).find(k => k === 'w:tc' || k === 'tc');
            if (tcKey) {
                cells.push(this.parseTableCell(item[tcKey]));
            }
        });
        return {
            type: 'tableRow',
            content: cells
        };
    }

    private parseTableCell(tcContent: any[]) {
        const content: any[] = [];
        tcContent.forEach(item => {
            const pKey = Object.keys(item).find(k => k === 'w:p' || k === 'p');
            if (pKey) {
                content.push(...this.parseParagraph(item[pKey]));
            }
        });
        return {
            type: 'tableCell',
            content
        };
    }
}
