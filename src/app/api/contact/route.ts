import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.CONTACT_EMAIL || "bfalkner9@gmail.com",
    pass: process.env.CONTACT_EMAIL_APP_PASSWORD || "",
  },
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, message } = body as {
      name: string;
      email: string;
      message: string;
    };

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: "Name, email, and message are required" },
        { status: 400 }
      );
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    await transporter.sendMail({
      from: `"GREENROOM Contact" <${process.env.CONTACT_EMAIL || "bfalkner9@gmail.com"}>`,
      to: process.env.CONTACT_EMAIL || "bfalkner9@gmail.com",
      replyTo: email,
      subject: `[GREENROOM] Contact from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px;">
          <h2 style="color: #00FF88;">New GREENROOM Contact Message</h2>
          <p><strong>From:</strong> ${name} (${email})</p>
          <hr style="border: 1px solid #2a2a2a;" />
          <p style="white-space: pre-wrap;">${message}</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Contact form error:", error);
    return NextResponse.json(
      { error: "Failed to send message. Please try again later." },
      { status: 500 }
    );
  }
}
