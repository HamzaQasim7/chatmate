import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { SelectorManager } from '@/lib/selector_manager';

interface CalibrationModalProps {
    platformId: string;
    onClose: () => void;
}

let calibrationRoot: ReactDOM.Root | null = null;

export const mountCalibrationModal = (platformId: string) => {
    if (document.getElementById('whatsapp-ai-calibration-root')) return; // Already showing

    const container = document.createElement('div');
    container.id = 'whatsapp-ai-calibration-root';
    document.body.appendChild(container);

    calibrationRoot = ReactDOM.createRoot(container);
    calibrationRoot.render(
        <CalibrationModal
            platformId={platformId}
            onClose={() => {
                if (calibrationRoot) {
                    calibrationRoot.unmount();
                    calibrationRoot = null;
                }
                container.remove();
            }}
        />
    );
};

export const CalibrationModal: React.FC<CalibrationModalProps> = ({ platformId, onClose }) => {
    const [step, setStep] = useState<'intro' | 'selecting' | 'success'>('intro');
    const [hoveredElement, setHoveredElement] = useState<HTMLElement | null>(null);

    useEffect(() => {
        if (step === 'selecting') {
            const handleMouseOver = (e: MouseEvent) => {
                e.stopPropagation();
                const target = e.target as HTMLElement;
                // Don't highlight our own modal
                if (target.closest('#whatsapp-ai-calibration-overlay')) return;

                target.style.outline = '2px solid #eb0029';
                target.style.cursor = 'crosshair';
                setHoveredElement(target);
            };

            const handleMouseOut = (e: MouseEvent) => {
                e.stopPropagation();
                const target = e.target as HTMLElement;
                target.style.outline = '';
                target.style.cursor = '';
            };

            const handleClick = async (e: MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();

                const target = e.target as HTMLElement;
                if (target.closest('#whatsapp-ai-calibration-overlay')) return;

                // Clean up styles
                target.style.outline = '';
                target.style.cursor = '';

                // Generate robust selector
                const selector = generateSelector(target);

                // Save override
                await SelectorManager.getInstance().saveUserOverride(platformId, 'input_field', selector);

                setStep('success');
                setTimeout(() => {
                    onClose();
                    window.location.reload(); // Reload to apply new selector
                }, 1500);
            };

            document.addEventListener('mouseover', handleMouseOver, true);
            document.addEventListener('mouseout', handleMouseOut, true);
            document.addEventListener('click', handleClick, true);

            return () => {
                document.removeEventListener('mouseover', handleMouseOver, true);
                document.removeEventListener('mouseout', handleMouseOut, true);
                document.removeEventListener('click', handleClick, true);
                if (hoveredElement) {
                    hoveredElement.style.outline = '';
                    hoveredElement.style.cursor = '';
                }
            };
        }
    }, [step, platformId, onClose, hoveredElement]);

    const generateSelector = (el: HTMLElement): string => {
        // 1. ID (best)
        if (el.id) return `#${el.id}`;

        // 2. Data attributes (very robust)
        const dataAttrs = ['data-testid', 'data-id', 'data-qa', 'aria-label', 'role'];
        for (const attr of dataAttrs) {
            if (el.hasAttribute(attr)) {
                return `[${attr}="${el.getAttribute(attr)}"]`;
            }
        }

        // 3. Classes (good but specific)
        if (el.className && typeof el.className === 'string' && el.className.trim() !== '') {
            const classes = el.className.split(' ').filter(c => c.trim().length > 0 && !c.includes('hover') && !c.includes('active'));
            if (classes.length > 0) {
                return `.${classes.join('.')}`;
            }
        }

        // 4. Tag + Hierarchy (fallback)
        return el.tagName.toLowerCase();
    };

    if (step === 'intro') {
        return (
            <div id="whatsapp-ai-calibration-overlay" style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 10000,
                display: 'flex', justifyContent: 'center', alignItems: 'center'
            }}>
                <div style={{
                    backgroundColor: 'white', padding: '2rem', borderRadius: '8px',
                    maxWidth: '500px', textAlign: 'center'
                }}>
                    <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#333' }}>⚠️ Connection Issue</h2>
                    <p style={{ marginBottom: '1.5rem', color: '#666' }}>
                        We're having trouble identifying the chat input box on this page properly.
                        This usually happens when the website updates its design.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                        <button onClick={onClose} style={{
                            padding: '0.5rem 1rem', border: '1px solid #ccc', borderRadius: '4px',
                            background: 'transparent', cursor: 'pointer'
                        }}>
                            Cancel
                        </button>
                        <button onClick={() => setStep('selecting')} style={{
                            padding: '0.5rem 1rem', border: 'none', borderRadius: '4px',
                            background: '#eb0029', color: 'white', cursor: 'pointer', fontWeight: 'bold'
                        }}>
                            Start Calibration
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (step === 'selecting') {
        return (
            <div id="whatsapp-ai-calibration-overlay" style={{
                position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
                backgroundColor: 'rgba(0, 0, 0, 0.8)', color: 'white', padding: '10px 20px',
                borderRadius: '20px', zIndex: 10000, pointerEvents: 'none',
                fontSize: '16px', fontWeight: 'bold'
            }}>
                🎯 innovative click on the Message Input Box
            </div>
        );
    }

    return (
        <div id="whatsapp-ai-calibration-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 10000,
            display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
            <div style={{
                backgroundColor: 'white', padding: '2rem', borderRadius: '8px',
                maxWidth: '500px', textAlign: 'center'
            }}>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#0eb500' }}>Config Saved!</h2>
                <p style={{ color: '#666' }}>
                    The extension has learned the new layout. Reloading the page...
                </p>
            </div>
        </div>
    );
};
