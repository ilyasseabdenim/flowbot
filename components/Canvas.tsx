import React, { useRef, useState, DragEvent, WheelEvent, MouseEvent, useCallback, useEffect, useMemo } from 'react';
import { useFlow } from '../context/FlowContext';
import { BlockType, Position } from '../types';
import BlockComponent from './Block';
import CreationContextMenu from './CreationContextMenu';
import SelectionToolbar from './SelectionToolbar';
import { PlusIcon } from './icons/PlusIcon';
import { MinusIcon } from './icons/MinusIcon';

const Canvas: React.FC = () => {
    const { 
        blocks, 
        connections, 
        addBlock, 
        selectedBlockIds,
        connectingFrom,
        removeConnection,
        openContextMenu,
        contextMenuState,
    } = useFlow();
    const canvasRef = useRef<HTMLDivElement>(null);
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
    const [isPanning, setIsPanning] = useState(false);
    const [pointerPosition, setPointerPosition] = useState({ x: 0, y: 0 });
    const [isMounted, setIsMounted] = useState(false);
    const [hoveredConnectionId, setHoveredConnectionId] = useState<string | null>(null);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const getCanvasCoordinates = useCallback((clientX: number, clientY: number): Position => {
        if (!canvasRef.current) return { x: 0, y: 0 };
        const rect = canvasRef.current.getBoundingClientRect();
        return {
            x: (clientX - rect.left - transform.x) / transform.scale,
            y: (clientY - rect.top - transform.y) / transform.scale,
        };
    }, [transform]);

    const onDragOver = (event: DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    };

    const onDrop = (event: DragEvent) => {
        event.preventDefault();
        const type = event.dataTransfer.getData('application/reactflow') as BlockType;
        if (type) {
            const position = getCanvasCoordinates(event.clientX, event.clientY);
            addBlock(type, position);
        }
    };

    const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        const scaleAmount = -event.deltaY * 0.001;
        const newScale = Math.max(0.2, Math.min(2, transform.scale + scaleAmount));
        
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        const newX = mouseX - (mouseX - transform.x) * (newScale / transform.scale);
        const newY = mouseY - (mouseY - transform.y) * (newScale / transform.scale);
        
        setTransform({ x: newX, y: newY, scale: newScale });
    };

    const onMouseDown = (event: MouseEvent) => {
        if (event.button === 0 && event.target === event.currentTarget) {
            setIsPanning(true);
            // As per user request, clicking the canvas to pan should not clear selection.
        }
    };

    const onMouseMove = (event: MouseEvent) => {
        if (isPanning) {
            setTransform(t => ({
                ...t,
                x: t.x + event.movementX,
                y: t.y + event.movementY,
            }));
        }
        setPointerPosition({ x: event.clientX, y: event.clientY });
    };

    const onMouseUp = (event: MouseEvent) => {
        if (isPanning) {
            setIsPanning(false);
        }
        if (connectingFrom && event.target === event.currentTarget) {
            const position = getCanvasCoordinates(event.clientX, event.clientY);
            openContextMenu({ type: 'create', position, source: connectingFrom });
        }
    };

    const getHandleWorldPosition = (blockId: string, handleId: string): Position | null => {
        const canvasRect = canvasRef.current?.getBoundingClientRect();
        if (!canvasRect) return null;

        const el = document.getElementById(`handle-${blockId}-${handleId}`);
        if (!el) return null;

        const handleRect = el.getBoundingClientRect();
        const handleCenterX = handleRect.left + handleRect.width / 2;
        const handleCenterY = handleRect.top + handleRect.height / 2;

        const worldX = (handleCenterX - canvasRect.left - transform.x) / transform.scale;
        const worldY = (handleCenterY - canvasRect.top - transform.y) / transform.scale;
        
        return { x: worldX, y: worldY };
    }

    const selectionToolbarPosition = useMemo(() => {
        if (selectedBlockIds.length === 0) return null;

        const selectedBlocks = blocks.filter(b => selectedBlockIds.includes(b.id));
        if (selectedBlocks.length === 0) return null;

        let minX = Infinity, minY = Infinity, maxX = -Infinity;
        selectedBlocks.forEach(b => {
            minX = Math.min(minX, b.position.x);
            minY = Math.min(minY, b.position.y);
            maxX = Math.max(maxX, b.position.x + 256); // 256 is w-64
        });
        
        const canvasX = (minX + maxX) / 2;
        const canvasY = minY - 60; // 60px above the top of the selection box

        return {
            left: canvasX,
            top: canvasY
        };
    }, [selectedBlockIds, blocks]);

    const connectingToPosition = getCanvasCoordinates(pointerPosition.x, pointerPosition.y);

    return (
        <div
            ref={canvasRef}
            className={`w-full h-full overflow-hidden relative ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onWheel={onWheel}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
        >
            <svg className="absolute top-0 left-0 w-full h-full pointer-events-none">
                <g style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}>
                    {isMounted && connections.map(conn => {
                        const sourcePos = getHandleWorldPosition(conn.source.blockId, conn.source.handleId);
                        const targetPos = getHandleWorldPosition(conn.target.blockId, conn.target.handleId);
                        if (!sourcePos || !targetPos) return null;

                        const isHovered = hoveredConnectionId === conn.id;

                        const d = `M ${sourcePos.x} ${sourcePos.y} C ${sourcePos.x + 50} ${sourcePos.y}, ${targetPos.x - 50} ${targetPos.y}, ${targetPos.x} ${targetPos.y}`;

                        const p0 = sourcePos;
                        const p1 = { x: sourcePos.x + 50, y: sourcePos.y };
                        const p2 = { x: targetPos.x - 50, y: targetPos.y };
                        const p3 = targetPos;
                        const t = 0.5;
                        const midX = Math.pow(1 - t, 3) * p0.x + 3 * Math.pow(1 - t, 2) * t * p1.x + 3 * (1 - t) * Math.pow(t, 2) * p2.x + Math.pow(t, 3) * p3.x;
                        const midY = Math.pow(1 - t, 3) * p0.y + 3 * Math.pow(1 - t, 2) * t * p1.y + 3 * (1 - t) * Math.pow(t, 2) * p2.y + Math.pow(t, 3) * p3.y;


                        return (
                            <g 
                                key={conn.id}
                                onMouseEnter={() => setHoveredConnectionId(conn.id)}
                                onMouseLeave={() => setHoveredConnectionId(null)}
                            >
                                <path
                                    d={d}
                                    stroke="transparent"
                                    strokeWidth="15"
                                    fill="none"
                                    style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                                />
                                <path
                                    d={d}
                                    stroke={isHovered ? '#4f46e5' : '#a1a1aa'}
                                    strokeWidth="2"
                                    fill="none"
                                    style={{ pointerEvents: 'none' }}
                                />
                                {isHovered && (
                                    <foreignObject x={midX - 28} y={midY - 14} width="56" height="28" style={{ pointerEvents: 'all' }}>
                                        <div className="flex items-center justify-center bg-white rounded-full shadow-md gap-1 p-1">
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openContextMenu({ type: 'insert', connectionId: conn.id, position: {x: midX, y: midY} })
                                                }}
                                                className="w-6 h-6 text-gray-500 rounded-full flex items-center justify-center hover:bg-gray-100 hover:text-gray-800 focus:outline-none"
                                                aria-label="Insert block"
                                            >
                                                <PlusIcon />
                                            </button>
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeConnection(conn.id)
                                                }}
                                                className="w-6 h-6 text-gray-500 rounded-full flex items-center justify-center hover:bg-gray-100 hover:text-red-500 focus:outline-none"
                                                aria-label="Delete connection"
                                            >
                                                <MinusIcon />
                                            </button>
                                        </div>
                                    </foreignObject>
                                )}
                            </g>
                        );
                    })}
                    {isMounted && connectingFrom && (() => {
                        const sourcePos = getHandleWorldPosition(connectingFrom.blockId, connectingFrom.handleId);
                        if (!sourcePos) return null;

                        return (
                            <path
                                d={`M ${sourcePos.x} ${sourcePos.y} C ${sourcePos.x + 50} ${sourcePos.y}, ${connectingToPosition.x - 50} ${connectingToPosition.y}, ${connectingToPosition.x} ${connectingToPosition.y}`}
                                stroke="#6366f1"
                                strokeWidth="2"
                                fill="none"
                                strokeDasharray="5 5"
                            />
                        );
                    })()}
                </g>
            </svg>
            <div
                className="transform-origin-top-left"
                style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}
            >
                {selectionToolbarPosition && (
                     <SelectionToolbar
                        count={selectedBlockIds.length}
                        position={selectionToolbarPosition}
                    />
                )}
                {blocks.map(block => (
                    <BlockComponent key={block.id} block={block} />
                ))}
            </div>
            
            {contextMenuState && (
                <CreationContextMenu
                    position={contextMenuState.position}
                    transform={transform}
                />
            )}
        </div>
    );
};

export default Canvas;