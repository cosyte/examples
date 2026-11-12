---
id: performance
title: Performance
sidebar_label: Performance
description: "Why the starters have no benchmark of their own, and where to find the measured numbers for each library they use."
---

# Performance

The starters are demonstrations: each one handles a single synthetic message, document or file, and
most of its time goes to starting Node.js and loading the libraries. A number measured on that would
say nothing about how fast an integration built from it runs, so we do not benchmark them.

## Where the numbers are

The libraries are where speed is measured: each library's docs at
[docs.cosyte.com](https://docs.cosyte.com/) say what we measure for it and how, on its Performance
page where it has one.

## How to measure your own

Build your integration from a starter, then measure it with your own messages, at their real sizes,
on the hardware it will run on.

## Current numbers

The numbers for this section are measured on `main` at each release and filled in when the release
is built. They are never typed by hand.
