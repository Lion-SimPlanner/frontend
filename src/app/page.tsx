'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const scrollToAbout = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div
      className={`bg-white text-gray-900 font-sans transition-opacity duration-700 ${mounted ? 'opacity-100' : 'opacity-0'
        }`}
    >
      {/* HERO SECTION */}
      <section id="home" className="relative min-h-screen overflow-hidden bg-black">
        <img
          src="/liontakeoff.jpg"
          alt="Lion Air aircraft on takeoff"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/10 to-black/60" />

        <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center select-none">
          <span className="text-[12vw] leading-none font-black uppercase tracking-tight text-white/10 whitespace-nowrap">
            LION SIMPLANNER
          </span>
        </div>

        {/* NAVBAR */}
        <div className="relative z-20 flex justify-center pt-6 px-6">
          <nav className="relative flex w-full max-w-5xl items-center justify-between rounded-full bg-white px-6 py-3 shadow-lg">
            <div className="flex items-center gap-2">
              <img src="/lion logo.png" alt="Lion SimPlanner" className="h-8 w-8 object-contain" />
              <span className="text-sm font-black uppercase tracking-widest text-gray-950">
                Lion SimPlanner
              </span>
            </div>

            <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-8">
              <a
                href="#home"
                className="text-xs font-black uppercase tracking-widest text-gray-700 transition-opacity duration-300 hover:opacity-60"
              >
                Home
              </a>
              <a
                href="#about"
                onClick={scrollToAbout}
                className="text-xs font-black uppercase tracking-widest text-gray-700 transition-opacity duration-300 hover:opacity-60"
              >
                About
              </a>
            </div>

            <Link
              href="/login"
              className="flex items-center gap-1 rounded-full bg-brand-red px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white transition-opacity duration-300 hover:opacity-80"
            >
              Login
              <span aria-hidden="true">&rarr;</span>
            </Link>
          </nav>
        </div>

        {/* HERO CONTENT aligned to the same max-width and right edge as the navbar login button */}
        <div className="relative z-10 mx-auto max-w-5xl px-6 pt-24 md:pt-32">
          <div className="flex justify-end">
            <div className="flex flex-col items-end text-right">
              <p className="max-w-sm text-sm font-medium leading-relaxed text-white/90">
                Schedule every simulator session with total confidence. Lion SimPlanner pairs
                pilots, instructors, and Level D full-flight simulators in one validation-driven
                platform &mdash; built to move your training operation fast, and with zero
                guesswork.
              </p>

              <div className="mt-10 flex flex-wrap justify-end items-center gap-6">
                <div className="rounded-lg bg-black/40 px-4 py-3 backdrop-blur-sm text-right">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-white/70">
                    Validation-Driven Ops
                  </span>
                  <span className="block text-xs font-black uppercase tracking-widest text-white">
                    Certified Platform 2026
                  </span>
                </div>

                <div className="text-right">
                  <span className="block text-4xl font-black text-brand-red">24/7</span>
                  <span className="block text-xs font-black uppercase tracking-widest text-white/80">
                    Real-Time Ops Visibility
                  </span>
                </div>
              </div>

              <Link
                href="/login"
                className="mt-10 inline-flex items-center gap-1 rounded-full bg-brand-red px-6 py-3 text-xs font-black uppercase tracking-widest text-white transition-opacity duration-300 hover:opacity-80"
              >
                Login
                <span aria-hidden="true">&rarr;</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT SECTION */}
      <section id="about" className="scroll-mt-24 bg-gray-950 px-6 py-24 text-white">
        <div className="mx-auto max-w-5xl">
          <span className="inline-block rounded-full border border-brand-red px-4 py-1 text-[10px] font-black uppercase tracking-widest text-brand-red">
            About Lion SimPlanner
          </span>

          <h2 className="mt-4 text-3xl font-black uppercase tracking-tight text-white md:text-4xl">
            Setting New Standards For Safe And Efficient Pilot Training.
          </h2>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="flex flex-col justify-between">
              <blockquote className="rounded-lg border border-white/10 bg-white/5 p-6">
                <span className="text-3xl font-black text-brand-red">&ldquo;</span>
                <p className="mt-2 text-sm font-medium italic leading-relaxed text-white/80">
                  We do not just build schedules; we build a validation-driven system so
                  every simulator session runs exactly as planned, from pairing to
                  sign-off.
                </p>
              </blockquote>

              <div className="mt-8 flex items-center gap-3">
                <span className="text-3xl font-black text-brand-red">3</span>
                <span className="h-8 w-px bg-white/20" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white/70">
                  Roles Working In One Connected Platform
                </span>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg">
              <img
                src="/pilot.jpg"
                alt="pilot"
                className="h-full w-full object-cover"
              />
              <div className="bg-gray-900 p-5">
                <p className="text-xs font-medium leading-relaxed text-white/70">
                  Our operations run on clear roles and sharp timing. Engineers keep every
                  simulator validated, instructors keep every syllabus current, and admins
                  keep every pairing on schedule &mdash; giving your training program total
                  peace of mind from booking to sign-off.
                </p>
                <Link
                  href="/login"
                  className="mt-4 inline-flex items-center gap-1 rounded-full bg-brand-red px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white transition-opacity duration-300 hover:opacity-80"
                >
                  Login
                  <span aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: 'Simulator Scheduling',
                body: 'Pair pilots with instructors and simulator instruments on one calendar, with zero double-bookings.',
                highlight: false,
              },
              {
                title: 'Instructor-Led Syllabi',
                body: 'Instructors attach training material and syllabi directly to every booked session.',
                highlight: true,
              },
              {
                title: 'Maintenance Oversight',
                body: 'Engineers flag machines under maintenance in real time, keeping every session validated.',
                highlight: false,
              },
              {
                title: 'Role-Based Operations',
                body: 'Admin, Engineer, and Instructor each get a focused dashboard built for their exact workflow.',
                highlight: false,
              },
            ].map((card) => (
              <div
                key={card.title}
                className={`rounded-lg p-6 transition-opacity duration-300 hover:opacity-90 ${card.highlight ? 'bg-brand-red text-white' : 'bg-white text-gray-950'
                  }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="h-8 w-8"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.5 19.5l19-7-19-7 4 7-4 7z"
                  />
                </svg>
                <h3 className="mt-4 text-sm font-black uppercase tracking-wide">
                  {card.title}
                </h3>
                <p
                  className={`mt-2 text-xs font-medium leading-relaxed ${card.highlight ? 'text-white/90' : 'text-gray-500'
                    }`}
                >
                  {card.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
