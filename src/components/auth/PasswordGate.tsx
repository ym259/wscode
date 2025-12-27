'use client';

import { useState, useEffect, ReactNode } from 'react';
import styles from './PasswordGate.module.css';

interface PasswordGateProps {
    children: ReactNode;
}

const AUTH_STORAGE_KEY = 'editor_authenticated';

export default function PasswordGate({ children }: PasswordGateProps) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [passwordRequired, setPasswordRequired] = useState(false);

    useEffect(() => {
        checkAuthStatus();
    }, []);

    const checkAuthStatus = async () => {
        try {
            // First check if password is required
            const response = await fetch('/api/auth');
            const data = await response.json();

            if (!data.passwordRequired) {
                // No password required, allow access
                setIsAuthenticated(true);
                setIsLoading(false);
                return;
            }

            setPasswordRequired(true);

            // Check if already authenticated in this session
            const storedAuth = sessionStorage.getItem(AUTH_STORAGE_KEY);
            if (storedAuth === 'true') {
                setIsAuthenticated(true);
            }
        } catch (err) {
            console.error('Failed to check auth status:', err);
            // On error, assume no password required
            setIsAuthenticated(true);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        try {
            const response = await fetch('/api/auth', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ password }),
            });

            const data = await response.json();

            if (data.success) {
                sessionStorage.setItem(AUTH_STORAGE_KEY, 'true');
                setIsAuthenticated(true);
            } else {
                setError(data.error || 'Authentication failed');
                setPassword('');
            }
        } catch (err) {
            console.error('Auth error:', err);
            setError('An error occurred. Please try again.');
        }
    };

    if (isLoading) {
        return (
            <div className={styles.loadingContainer}>
                <div className={styles.spinner} />
            </div>
        );
    }

    if (!passwordRequired || isAuthenticated) {
        return <>{children}</>;
    }

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <div className={styles.header}>
                    <div className={styles.icon}>🔒</div>
                    <h1 className={styles.title}>Access Required</h1>
                    <p className={styles.subtitle}>Enter the password to continue</p>
                </div>

                <form onSubmit={handleSubmit} className={styles.form}>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password"
                        className={styles.input}
                        autoFocus
                    />

                    {error && <p className={styles.error}>{error}</p>}

                    <button type="submit" className={styles.button}>
                        Unlock
                    </button>
                </form>
            </div>
        </div>
    );
}
