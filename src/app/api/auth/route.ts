import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
    // Check if password protection is enabled
    const sitePassword = process.env.SITE_PASSWORD;
    return NextResponse.json({
        passwordRequired: !!sitePassword && sitePassword.length > 0
    });
}

export async function POST(request: NextRequest) {
    const sitePassword = process.env.SITE_PASSWORD;

    // If no password is set, allow access
    if (!sitePassword || sitePassword.length === 0) {
        return NextResponse.json({ success: true });
    }

    try {
        const { password } = await request.json();

        if (password === sitePassword) {
            return NextResponse.json({ success: true });
        } else {
            return NextResponse.json(
                { success: false, error: 'Invalid password' },
                { status: 401 }
            );
        }
    } catch {
        return NextResponse.json(
            { success: false, error: 'Invalid request' },
            { status: 400 }
        );
    }
}
