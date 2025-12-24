/**
 * useVoiceAgent Hook
 * 
 * Manages WebRTC connection to OpenAI Realtime API for voice interaction.
 * Handles microphone capture, audio playback, and tool execution.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { AgentEvent, ChatMessage } from '@/types';

export interface VoiceAgentConfig {
    /** Callback when tool is executed */
    onToolCall?: (name: string, args: Record<string, unknown>) => Promise<string>;
    /** Callback for agent events (for UI display) */
    onEvent?: (event: AgentEvent) => void;
    /** Callback for transcript updates */
    onTranscript?: (text: string, isFinal: boolean, role: 'user' | 'assistant') => void;
    /** Chat history for context */
    chatHistory?: ChatMessage[];
}

export interface VoiceAgentState {
    isConnected: boolean;
    isConnecting: boolean;
    isListening: boolean;
    isSpeaking: boolean;
    error: string | null;
    currentTranscript: string;
}

export interface VoiceAgentActions {
    startSession: () => Promise<void>;
    stopSession: () => void;
    toggleSession: () => Promise<void>;
}

/**
 * Hook for managing voice agent session with OpenAI Realtime API
 */
export function useVoiceAgent(config: VoiceAgentConfig): VoiceAgentState & VoiceAgentActions {
    const { onToolCall, onEvent, onTranscript } = config;

    // State
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentTranscript, setCurrentTranscript] = useState('');

    // Refs
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const dataChannelRef = useRef<RTCDataChannel | null>(null);
    const audioElementRef = useRef<HTMLAudioElement | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);

    // Cleanup function
    const cleanup = useCallback(() => {
        console.log('[VoiceAgent] Cleaning up...');

        if (dataChannelRef.current) {
            dataChannelRef.current.close();
            dataChannelRef.current = null;
        }

        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }

        if (audioElementRef.current) {
            audioElementRef.current.pause();
            audioElementRef.current.srcObject = null;
        }

        setIsConnected(false);
        setIsConnecting(false);
        setIsListening(false);
        setIsSpeaking(false);
    }, []);

    // Handle incoming data channel messages
    const handleDataChannelMessage = useCallback(async (event: MessageEvent) => {
        try {
            const message = JSON.parse(event.data);
            console.log('[VoiceAgent] Received message:', message.type);

            switch (message.type) {
                case 'session.created':
                    console.log('[VoiceAgent] Session created successfully');
                    setIsConnected(true);
                    setIsConnecting(false);
                    break;

                case 'input_audio_buffer.speech_started':
                    setIsListening(true);
                    break;

                case 'input_audio_buffer.speech_stopped':
                    setIsListening(false);
                    break;

                case 'response.audio.playing':
                case 'response.audio_transcript.delta':
                    setIsSpeaking(true);
                    break;

                case 'response.audio.done':
                case 'response.done':
                    setIsSpeaking(false);
                    break;

                case 'conversation.item.input_audio_transcription.completed':
                    // User's speech transcription
                    if (message.transcript) {
                        setCurrentTranscript(message.transcript);
                        onTranscript?.(message.transcript, true, 'user');
                    }
                    break;

                case 'response.audio_transcript.done':
                    // Assistant's speech transcription
                    if (message.transcript) {
                        onTranscript?.(message.transcript, true, 'assistant');
                    }
                    break;

                case 'response.function_call_arguments.done':
                    // Tool call completed, execute it
                    if (message.name && onToolCall) {
                        const callId = message.call_id;
                        const toolName = message.name;
                        let args: Record<string, unknown> = {};

                        try {
                            args = JSON.parse(message.arguments || '{}');
                        } catch {
                            console.warn('[VoiceAgent] Failed to parse tool arguments');
                        }

                        console.log('[VoiceAgent] Executing tool:', toolName, args);
                        onEvent?.({
                            type: 'tool_start',
                            id: callId,
                            name: toolName,
                            args,
                            timestamp: Date.now()
                        });

                        try {
                            const result = await onToolCall(toolName, args);
                            console.log('[VoiceAgent] Tool result:', result);

                            onEvent?.({
                                type: 'tool_result',
                                id: callId,
                                result,
                                status: 'success',
                                args,
                                timestamp: Date.now()
                            });

                            // Send result back to the model
                            if (dataChannelRef.current?.readyState === 'open') {
                                dataChannelRef.current.send(JSON.stringify({
                                    type: 'conversation.item.create',
                                    item: {
                                        type: 'function_call_output',
                                        call_id: callId,
                                        output: result
                                    }
                                }));

                                // Request the model to continue responding
                                dataChannelRef.current.send(JSON.stringify({
                                    type: 'response.create'
                                }));
                            }
                        } catch (error) {
                            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                            console.error('[VoiceAgent] Tool error:', errorMsg);

                            onEvent?.({
                                type: 'tool_result',
                                id: callId,
                                result: errorMsg,
                                status: 'failure',
                                timestamp: Date.now()
                            });

                            // Send error back to the model
                            if (dataChannelRef.current?.readyState === 'open') {
                                dataChannelRef.current.send(JSON.stringify({
                                    type: 'conversation.item.create',
                                    item: {
                                        type: 'function_call_output',
                                        call_id: callId,
                                        output: `Error: ${errorMsg}`
                                    }
                                }));

                                dataChannelRef.current.send(JSON.stringify({
                                    type: 'response.create'
                                }));
                            }
                        }
                    }
                    break;

                case 'error':
                    console.error('[VoiceAgent] Server error:', message.error);
                    setError(message.error?.message || 'Unknown error from server');
                    break;
            }
        } catch (e) {
            console.error('[VoiceAgent] Failed to parse message:', e);
        }
    }, [onToolCall, onEvent, onTranscript]);

    // Start voice session
    const startSession = useCallback(async () => {
        if (isConnected || isConnecting) {
            console.log('[VoiceAgent] Already connected or connecting');
            return;
        }

        setIsConnecting(true);
        setError(null);

        try {
            // 1. Get ephemeral token from our API
            console.log('[VoiceAgent] Requesting ephemeral token...');
            const response = await fetch('/api/realtime/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to create session');
            }

            const sessionData = await response.json();
            const ephemeralKey = sessionData.client_secret?.value;

            if (!ephemeralKey) {
                throw new Error('No ephemeral key received');
            }

            console.log('[VoiceAgent] Got ephemeral token, creating peer connection...');

            // 2. Create RTCPeerConnection
            const pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            peerConnectionRef.current = pc;

            // 3. Set up audio playback
            const audioEl = new Audio();
            audioEl.autoplay = true;
            audioElementRef.current = audioEl;

            pc.ontrack = (event) => {
                console.log('[VoiceAgent] Received audio track');
                audioEl.srcObject = event.streams[0];
            };

            // 4. Get microphone access
            console.log('[VoiceAgent] Requesting microphone access...');
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            mediaStreamRef.current = stream;

            // Add microphone track to peer connection
            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
            });

            // 5. Create data channel for events
            const dc = pc.createDataChannel('oai-events');
            dataChannelRef.current = dc;

            dc.onopen = () => {
                console.log('[VoiceAgent] Data channel opened');
            };

            dc.onmessage = handleDataChannelMessage;

            dc.onerror = (event) => {
                console.error('[VoiceAgent] Data channel error:', event);
            };

            // 6. Create and set local SDP offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            // 7. Send offer to OpenAI and get answer
            console.log('[VoiceAgent] Sending SDP offer to OpenAI...');
            const sdpResponse = await fetch('https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${ephemeralKey}`,
                    'Content-Type': 'application/sdp'
                },
                body: offer.sdp
            });

            if (!sdpResponse.ok) {
                throw new Error(`SDP exchange failed: ${sdpResponse.statusText}`);
            }

            const answerSdp = await sdpResponse.text();
            await pc.setRemoteDescription({
                type: 'answer',
                sdp: answerSdp
            });

            console.log('[VoiceAgent] WebRTC connection established');

            // Connection state handling
            pc.onconnectionstatechange = () => {
                console.log('[VoiceAgent] Connection state:', pc.connectionState);
                if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                    cleanup();
                    setError('Connection lost');
                }
            };

        } catch (e) {
            console.error('[VoiceAgent] Failed to start session:', e);
            setError(e instanceof Error ? e.message : 'Failed to start voice session');
            cleanup();
        }
    }, [isConnected, isConnecting, handleDataChannelMessage, cleanup]);

    // Stop voice session
    const stopSession = useCallback(() => {
        console.log('[VoiceAgent] Stopping session...');
        cleanup();
    }, [cleanup]);

    // Toggle session
    const toggleSession = useCallback(async () => {
        if (isConnected || isConnecting) {
            stopSession();
        } else {
            await startSession();
        }
    }, [isConnected, isConnecting, startSession, stopSession]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cleanup();
        };
    }, [cleanup]);

    return {
        isConnected,
        isConnecting,
        isListening,
        isSpeaking,
        error,
        currentTranscript,
        startSession,
        stopSession,
        toggleSession
    };
}
