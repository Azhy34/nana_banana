# ComfyUI

- [Tutorials (297 pages)](https://docs.comfy.org/_llms/en/tutorials.txt): Documentation for Tutorials.
- [Comfy Router (248 pages)](https://docs.comfy.org/_llms/en/comfy-router.txt): Documentation for Comfy Router.
- [Built-in Nodes (1142 pages)](https://docs.comfy.org/_llms/en/built-in-nodes.txt): Documentation for Built-in Nodes.
- [Developer (177 pages)](https://docs.comfy.org/_llms/en/developer.txt): Documentation for Developer.

## Getting started

- [ComfyUI Official Documentation](https://docs.comfy.org/index.md): Official documentation for ComfyUI, the open source node-based generative AI application. Learn to build workflows for image, video, audio, and 3D generation.
- [Comfy Cloud - Official ComfyUI Cloud Platform Powered by RTX 6000 Pro](https://docs.comfy.org/get_started/cloud.md): Run ComfyUI workflows online with Comfy Cloud, the official cloud platform powered by NVIDIA RTX 6000 Pro GPUs. No local installation required.
- [Getting Started with AI Image Generation](https://docs.comfy.org/get_started/first_generation.md): Generate your first AI image with ComfyUI. Learn to load example workflows, install models, and complete your first text-to-image generation.
- [Changelog](https://docs.comfy.org/changelog/index.md): ComfyUI changelog: the latest features, improvements, and bug fixes in each release, updated as new versions ship.

### Local (Self-Hosted)

- [System Requirements](https://docs.comfy.org/installation/system_requirements.md): Hardware and software requirements for installing and running ComfyUI.
- [ComfyUI Portable for Windows](https://docs.comfy.org/installation/comfyui_portable_windows.md): Download and run ComfyUI Portable on Windows: a standalone package with embedded Python and CUDA builds for NVIDIA GPUs. Extract the archive, then run ComfyUI.
- [Install ComfyUI Manually (Windows, macOS, Linux)](https://docs.comfy.org/installation/manual_install.md): Install ComfyUI manually on Windows, macOS, or Linux: create a virtual environment, clone the repository, install GPU dependencies, and start the app.
- [How to Update ComfyUI](https://docs.comfy.org/installation/update_comfyui.md): Update ComfyUI on any install type: Portable update scripts, Desktop updates, and git pull for manual installs, plus fixes for common update issues.

#### Comfy Desktop

- [Comfy Desktop Overview](https://docs.comfy.org/installation/desktop/overview.md): Comfy Desktop overview: a desktop app that installs, manages, and launches multiple instances of ComfyUI, the node-based engine for generative AI.
- [Comfy Desktop FAQ](https://docs.comfy.org/installation/desktop/faq.md): Common questions and troubleshooting tips for Comfy Desktop

##### Installation

- [Comfy Desktop for Windows](https://docs.comfy.org/installation/desktop/windows.md): Install Comfy Desktop on Windows: system requirements, setup steps, updates, and a clean uninstall for running ComfyUI locally on Windows 10 and later.
- [Comfy Desktop for macOS](https://docs.comfy.org/installation/desktop/macos.md): Install Comfy Desktop on macOS: system requirements, setup steps, updates, and a clean uninstall for running ComfyUI locally on Apple silicon Macs.
- [Comfy Desktop on Linux](https://docs.comfy.org/installation/desktop/linux.md): Install Comfy Desktop on Linux using the official .deb or AppImage packages. Source builds need Ubuntu 22.04+, x64, and Node.js v22 LTS.

##### Usage Guide

- [Using Comfy Desktop](https://docs.comfy.org/installation/desktop/usage/overview.md): Overview of Comfy Desktop — creating new installations, managing instances, and more
- [Instance Management](https://docs.comfy.org/installation/desktop/usage/instance-management.md): Create, edit, rename, and delete ComfyUI instances in Comfy Desktop
- [Workspaces and ComfyUI Builds in Comfy Desktop](https://docs.comfy.org/installation/desktop/usage/workspaces-and-builds.md): Sign in to Comfy Desktop to switch workspaces, install ComfyUI Builds from your workspace, and create a Build from a local instance.
- [Comfy Desktop Snapshots](https://docs.comfy.org/installation/desktop/usage/snapshots.md): Back up, restore, and share ComfyUI instance configurations in Comfy Desktop
- [Model Downloads in Comfy Desktop](https://docs.comfy.org/installation/desktop/usage/downloads.md): Track active and recent model and output downloads, retry or pause them, and see where Comfy Desktop saves each file.
- [Managing Installations](https://docs.comfy.org/installation/desktop/usage/manage.md): Launch, update, snapshot, and manage your ComfyUI installations
- [Comfy Desktop Settings](https://docs.comfy.org/installation/desktop/usage/settings.md): Global settings, proxy/mirror configuration, and data locations
- [Performance Tests and Benchmarks](https://docs.comfy.org/installation/desktop/usage/performance-tests.md): Measure ComfyUI workflow speed with Performance Tests, then compare runs across GPUs, workflows, and instances with Benchmarks in Comfy Desktop
- [Migrate from Legacy Desktop](https://docs.comfy.org/installation/desktop/usage/migrate.md): Learn how to migrate your Legacy Desktop installation to Comfy Desktop

### Install Custom Nodes

- [How to Install Custom Nodes in ComfyUI](https://docs.comfy.org/installation/install_custom_node.md): Install custom nodes in ComfyUI with ComfyUI Manager, git clone, or a ZIP download, and install their Python dependencies safely.

#### ComfyUI-Manager

- [ComfyUI-Manager Overview](https://docs.comfy.org/manager/overview.md): An extension to manage custom nodes, models, and more in ComfyUI
- [ComfyUI-Manager Installation](https://docs.comfy.org/manager/install.md): Install ComfyUI-Manager on Desktop, Portable, or manual ComfyUI setups to search, install, and update custom nodes from inside the app.
- [ComfyUI-Manager Configuration](https://docs.comfy.org/manager/configuration.md): ComfyUI-Manager configuration reference: config.ini paths and options, security levels, and the protected system path introduced in V3.38.
- [ComfyUI Manager Troubleshooting](https://docs.comfy.org/manager/troubleshooting.md): Fix common ComfyUI-Manager issues: custom git executable paths, database errors, update failures, and more.

##### Node Management

- [Custom nodes (new UI)](https://docs.comfy.org/manager/pack-management.md): Install, update, and manage custom nodes with ComfyUI-Manager using the new interface
- [Managing custom nodes with ComfyUI-Manager (legacy UI)](https://docs.comfy.org/manager/legacy-ui.md): Install, update, and manage custom nodes with ComfyUI-Manager using the legacy interface

## Agent tools

- [ComfyUI Agent Tools: MCP, CLI, and In-App Agent](https://docs.comfy.org/agent-tools/index.md): Use ComfyUI with AI agents through Comfy MCP, Comfy CLI, and Comfy Agent.
- [Comfy MCP: Connect AI Agents to ComfyUI](https://docs.comfy.org/agent-tools/mcp.md): Connect AI agents to ComfyUI over the Model Context Protocol. Generate images, video, audio, and 3D, and run real workflows on Comfy Cloud or your own machine.
- [Comfy CLI: Run ComfyUI from the Terminal](https://docs.comfy.org/agent-tools/cli.md): Drive Comfy from the terminal: local ComfyUI, partner generate calls, and full workflows on Comfy Cloud. Complements MCP for scripts, CI, and automation.
- [Comfy Skills for Coding Agents](https://docs.comfy.org/agent-tools/skills.md): Agent skills and plugins for Comfy, published through the Comfy Skills repository.

### Comfy Agent

- [Comfy Agent](https://docs.comfy.org/agent-tools/in-app-agent.md): Use Comfy Agent to understand, build, edit, and run ComfyUI workflows. It is generally available in Comfy Cloud. Local support for Comfy Desktop is coming soon.
- [Get Started with Comfy Agent](https://docs.comfy.org/agent-tools/in-app-agent-installation.md): Open Comfy Agent in Comfy Cloud or Comfy Desktop.
- [Comfy Agent Skills](https://docs.comfy.org/agent-tools/in-app-agent-skills.md): Use personal and public skills to give Comfy Agent reusable instructions for your work.
- [Comfy Agent Data and Privacy](https://docs.comfy.org/agent-tools/in-app-agent-data-privacy.md): Understand what Comfy Agent uses to answer a request and how local and Cloud use differ.

## Support

- [Contact ComfyUI support](https://docs.comfy.org/support/contact-support.md): Get help with ComfyUI, Comfy Cloud, and Comfy Desktop. Use support.comfy.org, or report bugs in the matching GitHub repository.
- [Comfy data retention: what Comfy stores and for how long](https://docs.comfy.org/support/data-retention.md): How long Comfy keeps account data, customer content, and usage data, and how to request deletion of your account and associated data.

### Account Management

- [Create a Comfy account](https://docs.comfy.org/account/create-account.md): Learn how to create a new Comfy account for ComfyUI to access all features and services.
- [Log in to your Comfy account](https://docs.comfy.org/account/login.md): Access your Comfy account for ComfyUI to use all platform features and services.
- [Delete your Comfy account](https://docs.comfy.org/account/delete-account.md): Learn how to permanently delete your Comfy account for ComfyUI and associated data.

### Billing Support

#### Subscription

- [Subscribe to Comfy Cloud](https://docs.comfy.org/support/subscription/subscribing.md): Subscribe to Comfy Cloud from Plans & pricing. Choose For Personal or For Teams, pick monthly or yearly billing, then confirm payment to run workflows.
- [Manage Comfy Cloud billing and invoices](https://docs.comfy.org/support/subscription/managing.md): Manage your Comfy Cloud plan, payment methods, and invoices. Change plans in Comfy Cloud; payment methods and invoices are in the Stripe billing portal.
- [Change your Comfy Cloud plan](https://docs.comfy.org/support/subscription/changing-plan.md): Upgrade or downgrade a Comfy Cloud plan. Switch Personal or Teams, choose monthly or yearly billing, and see when the change takes effect.
- [Cancel your Comfy Cloud subscription](https://docs.comfy.org/support/subscription/canceling.md): Cancel a Comfy Cloud plan from Plan & Credits. Open more options, choose Cancel plan, then confirm. Access continues until the current billing period ends.

#### Payment

- [Comfy Cloud accepted payment methods](https://docs.comfy.org/support/payment/accepted-payment-methods.md): Pay for Comfy Cloud with major cards, Google Pay, or Link. Alipay is available in USD for Cloud and API credits. WeChat Pay is available in USD for API credits.
- [Edit Comfy Cloud payment information](https://docs.comfy.org/support/payment/editing-payment-information.md): Update a Comfy Cloud payment method or billing address from Plan & Credits. Billing & invoices opens the Stripe billing portal, where you edit the details.
- [View Comfy Cloud payment history](https://docs.comfy.org/support/payment/payment-history.md): Open Plan & Credits on Comfy Cloud, then Billing & invoices. Invoice history and PDF downloads are in the Stripe billing portal.
- [Fix a failed Comfy Cloud payment](https://docs.comfy.org/support/payment/unsuccessful-payments.md): If a Comfy Cloud payment fails, update your payment method from Plan & Credits or the Payment failed banner to avoid a paused subscription.
- [Comfy Cloud payment currency](https://docs.comfy.org/support/payment/payment-currency.md): Comfy Cloud prices are listed in USD. Choose USD at checkout for Alipay. WeChat Pay covers local API credits in USD only. Banks may convert other currencies.
- [Comfy Cloud invoice information](https://docs.comfy.org/support/payment/invoice-information.md): Comfy Cloud invoices use the billing details you enter at checkout. Updates apply only to future invoices, not ones already issued.

### Troubleshooting

- [How to Troubleshoot and Solve ComfyUI Issues](https://docs.comfy.org/troubleshooting/overview.md): ComfyUI troubleshooting guide: rule out custom nodes first, fix common core issues, and file a bug report with the right details.
- [How to Troubleshoot and Solve ComfyUI Model Issues](https://docs.comfy.org/troubleshooting/model-issues.md): Troubleshooting model-related problems including architecture mismatches, missing models, and loading errors
- [Troubleshooting Custom Node Issues](https://docs.comfy.org/troubleshooting/custom-node-issues.md): Fix ComfyUI custom node issues: disable all custom nodes with --disable-all-custom-nodes, then binary-search to isolate, fix, or remove the broken node.

### Community

- [Contributing](https://docs.comfy.org/community/contributing.md): Learn how to contribute to Comfy by exploring the GitHub organization's repositories, sharing workflows, or developing custom nodes.
- [Community links](https://docs.comfy.org/community/links.md): Get ComfyUI help and share your work through the community's Discord, support portal, forum, Matrix, GitHub, YouTube, X, LinkedIn, and Reddit channels.

## OpenAPI Specs

- [router-openapi](/router-openapi.yaml)
- [openapi-v2](/openapi-v2.yaml)
- [openapi-cloud](/openapi-cloud.yaml)
- [openapi](https://api.comfy.org/openapi)
- [claude-fable-5-1](/router-schemas/anthropic/claude-fable-5-1.json)
- [claude-fable-5](/router-schemas/anthropic/claude-fable-5.json)
- [claude-haiku-4-5-20251001](/router-schemas/anthropic/claude-haiku-4-5-20251001.json)
- [claude-opus-4-6](/router-schemas/anthropic/claude-opus-4-6.json)
- [claude-opus-4-7](/router-schemas/anthropic/claude-opus-4-7.json)
- [claude-opus-4-8](/router-schemas/anthropic/claude-opus-4-8.json)
- [claude-opus-5-5](/router-schemas/anthropic/claude-opus-5-5.json)
- [claude-opus-5](/router-schemas/anthropic/claude-opus-5.json)
- [claude-sonnet-4-5-20250929](/router-schemas/anthropic/claude-sonnet-4-5-20250929.json)
- [claude-sonnet-4-6](/router-schemas/anthropic/claude-sonnet-4-6.json)
- [claude-sonnet-5-5](/router-schemas/anthropic/claude-sonnet-5-5.json)
- [claude-sonnet-5](/router-schemas/anthropic/claude-sonnet-5.json)
- [switchx](/router-schemas/beeble/switchx.json)
- [erase-v1](/router-schemas/bfl/erase-v1.json)
- [flux-2-max](/router-schemas/bfl/flux-2-max.json)
- [flux-2-pro](/router-schemas/bfl/flux-2-pro.json)
- [flux-3-image](/router-schemas/bfl/flux-3-image.json)
- [flux-3-video](/router-schemas/bfl/flux-3-video.json)
- [flux-kontext-max](/router-schemas/bfl/flux-kontext-max.json)
- [flux-kontext-pro](/router-schemas/bfl/flux-kontext-pro.json)
- [flux-pro-1.0-expand](/router-schemas/bfl/flux-pro-1.0-expand.json)
- [flux-pro-1.0-fill](/router-schemas/bfl/flux-pro-1.0-fill.json)
- [flux-pro-1.1-ultra](/router-schemas/bfl/flux-pro-1.1-ultra.json)
- [flux-pro-1.1](/router-schemas/bfl/flux-pro-1.1.json)
- [video-edit-v1](/router-schemas/bfl/video-edit-v1.json)
- [video-upscale-v1](/router-schemas/bfl/video-upscale-v1.json)
- [vto-v1](/router-schemas/bfl/vto-v1.json)
- [fibo](/router-schemas/bria/fibo.json)
- [image-edit-add-object-by-text](/router-schemas/bria/image-edit-add-object-by-text.json)
- [image-edit-erase-by-text](/router-schemas/bria/image-edit-erase-by-text.json)
- [image-edit-erase-foreground](/router-schemas/bria/image-edit-erase-foreground.json)
- [image-edit-erase](/router-schemas/bria/image-edit-erase.json)
- [image-edit-expand](/router-schemas/bria/image-edit-expand.json)
- [image-edit-gen-fill](/router-schemas/bria/image-edit-gen-fill.json)
- [image-edit-increase-resolution](/router-schemas/bria/image-edit-increase-resolution.json)
- [image-edit-product-holding](/router-schemas/bria/image-edit-product-holding.json)
- [image-edit-product-virtual-tryon](/router-schemas/bria/image-edit-product-virtual-tryon.json)
- [image-edit-relight](/router-schemas/bria/image-edit-relight.json)
- [image-edit-remove-background-guided](/router-schemas/bria/image-edit-remove-background-guided.json)
- [image-edit-remove-background](/router-schemas/bria/image-edit-remove-background.json)
- [image-edit-replace-background](/router-schemas/bria/image-edit-replace-background.json)
- [image-edit-replace-object-by-text](/router-schemas/bria/image-edit-replace-object-by-text.json)
- [image-edit-reseason](/router-schemas/bria/image-edit-reseason.json)
- [image-edit-restore](/router-schemas/bria/image-edit-restore.json)
- [image](/router-schemas/bria/image.json)
- [video-edit-erase](/router-schemas/bria/video-edit-erase.json)
- [video-edit-green-screen](/router-schemas/bria/video-edit-green-screen.json)
- [video-edit-remove-background](/router-schemas/bria/video-edit-remove-background.json)
- [video-edit-replace-background](/router-schemas/bria/video-edit-replace-background.json)
- [dreamina-seedance-2-0-260128](/router-schemas/byteplus/dreamina-seedance-2-0-260128.json)
- [dreamina-seedance-2-0-fast-260128](/router-schemas/byteplus/dreamina-seedance-2-0-fast-260128.json)
- [dreamina-seedance-2-0-mini](/router-schemas/byteplus/dreamina-seedance-2-0-mini.json)
- [dreamina-seedance-2-5-260628](/router-schemas/byteplus/dreamina-seedance-2-5-260628.json)
- [seed-2-0-lite-260228](/router-schemas/byteplus/seed-2-0-lite-260228.json)
- [seed-2-0-mini-260215](/router-schemas/byteplus/seed-2-0-mini-260215.json)
- [seed-2-0-pro-260328](/router-schemas/byteplus/seed-2-0-pro-260328.json)
- [seed-audio-1.0-multilingual](/router-schemas/byteplus/seed-audio-1.0-multilingual.json)
- [seed-audio-1.0](/router-schemas/byteplus/seed-audio-1.0.json)
- [seedance-1-0-pro-250528](/router-schemas/byteplus/seedance-1-0-pro-250528.json)
- [seedance-1-0-pro-fast-251015](/router-schemas/byteplus/seedance-1-0-pro-fast-251015.json)
- [seedance-1-5-pro-251215](/router-schemas/byteplus/seedance-1-5-pro-251215.json)
- [seedream-4-0-250828](/router-schemas/byteplus/seedream-4-0-250828.json)
- [seedream-4-5-251128](/router-schemas/byteplus/seedream-4-5-251128.json)
- [seedream-5-0-260128](/router-schemas/byteplus/seedream-5-0-260128.json)
- [seedream-5-0-flash-260915](/router-schemas/byteplus/seedream-5-0-flash-260915.json)
- [seedream-5-0-pro-260628](/router-schemas/byteplus/seedream-5-0-pro-260628.json)
- [eleven_multilingual_v2](/router-schemas/elevenlabs/eleven_multilingual_v2.json)
- [eleven_sfx_v2](/router-schemas/elevenlabs/eleven_sfx_v2.json)
- [eleven_v3](/router-schemas/elevenlabs/eleven_v3.json)
- [eleven_v4_turbo](/router-schemas/elevenlabs/eleven_v4_turbo.json)
- [eleven_v4](/router-schemas/elevenlabs/eleven_v4.json)
- [crystal-upscaler](/router-schemas/fal/crystal-upscaler.json)
- [crystal-video-upscaler](/router-schemas/fal/crystal-video-upscaler.json)
- [fal-gpt-image-2.5-flare](/router-schemas/fal/fal-gpt-image-2.5-flare.json)
- [fal-gpt-image-2.5-sunburst](/router-schemas/fal/fal-gpt-image-2.5-sunburst.json)
- [fal-gpt-image-2](/router-schemas/fal/fal-gpt-image-2.json)
- [fal-nano-banana-2](/router-schemas/fal/fal-nano-banana-2.json)
- [fal-nano-banana-pro](/router-schemas/fal/fal-nano-banana-pro.json)
- [fal-seedance-2.0](/router-schemas/fal/fal-seedance-2.0.json)
- [fal-seedance-2.5](/router-schemas/fal/fal-seedance-2.5.json)
- [flux-3-max](/router-schemas/fal/flux-3-max.json)
- [h3-max-turbo](/router-schemas/fal/h3-max-turbo.json)
- [h3-max](/router-schemas/fal/h3-max.json)
- [patina](/router-schemas/fal/patina.json)
- [ai-image-upscaler-precision-v2](/router-schemas/freepik/ai-image-upscaler-precision-v2.json)
- [ai-skin-enhancer-creative](/router-schemas/freepik/ai-skin-enhancer-creative.json)
- [ai-skin-enhancer-faithful](/router-schemas/freepik/ai-skin-enhancer-faithful.json)
- [ai-skin-enhancer-flexible](/router-schemas/freepik/ai-skin-enhancer-flexible.json)
- [gemini-omni-1.1-flash](/router-schemas/gemini-interactions/gemini-omni-1.1-flash.json)
- [gemini-omni-flash-preview](/router-schemas/gemini-interactions/gemini-omni-flash-preview.json)
- [starfish](/router-schemas/heygen/starfish.json)
- [higgsfield-genjutsu-motion-transfer-v1.0](/router-schemas/higgsfield/higgsfield-genjutsu-motion-transfer-v1.0.json)
- [higgsfield-kling-3-4k](/router-schemas/higgsfield/higgsfield-kling-3-4k.json)
- [higgsfield-kling-3-pro](/router-schemas/higgsfield/higgsfield-kling-3-pro.json)
- [higgsfield-kling-3-std](/router-schemas/higgsfield/higgsfield-kling-3-std.json)
- [higgsfield-kling-3-turbo](/router-schemas/higgsfield/higgsfield-kling-3-turbo.json)
- [higgsfield-seedance-2.0](/router-schemas/higgsfield/higgsfield-seedance-2.0.json)
- [higgsfield-seedance-2.5](/router-schemas/higgsfield/higgsfield-seedance-2.5.json)
- [higgsfield-wan-3](/router-schemas/higgsfield/higgsfield-wan-3.json)
- [ideogram-4-5](/router-schemas/ideogram/ideogram-4-5.json)
- [ideogram-v3](/router-schemas/ideogram/ideogram-v3.json)
- [ideogram-v4](/router-schemas/ideogram/ideogram-v4.json)
- [p-image-ideogram](/router-schemas/ideogram/p-image-ideogram.json)
- [kling-3.0-turbo](/router-schemas/kling/kling-3.0-turbo.json)
- [kling-image-o1](/router-schemas/kling/kling-image-o1.json)
- [kling-v2-5-turbo](/router-schemas/kling/kling-v2-5-turbo.json)
- [kling-v2-6](/router-schemas/kling/kling-v2-6.json)
- [kling-v3-omni](/router-schemas/kling/kling-v3-omni.json)
- [kling-v3](/router-schemas/kling/kling-v3.json)
- [kling-video-o1](/router-schemas/kling/kling-video-o1.json)
- [videos-avatar-image2video](/router-schemas/kling/videos-avatar-image2video.json)
- [videos-lip-sync](/router-schemas/kling/videos-lip-sync.json)
- [videos-video-extend](/router-schemas/kling/videos-video-extend.json)
- [krea-2-large](/router-schemas/krea/krea-2-large.json)
- [krea-2-medium-turbo](/router-schemas/krea/krea-2-medium-turbo.json)
- [krea-2-medium](/router-schemas/krea/krea-2-medium.json)
- [krea-2](/router-schemas/krea/krea-2.json)
- [krea-3](/router-schemas/krea/krea-3.json)
- [ltx-2-5-fast](/router-schemas/ltx/ltx-2-5-fast.json)
- [ltx-2-5-pro](/router-schemas/ltx/ltx-2-5-pro.json)
- [ray-3.2](/router-schemas/luma_2/ray-3.2.json)
- [uni-1-max](/router-schemas/luma_2/uni-1-max.json)
- [uni-1](/router-schemas/luma_2/uni-1.json)
- [photon-1](/router-schemas/luma/photon-1.json)
- [photon-flash-1](/router-schemas/luma/photon-flash-1.json)
- [animations](/router-schemas/meshy/animations.json)
- [meshy-6](/router-schemas/meshy/meshy-6.json)
- [meshy-7.1](/router-schemas/meshy/meshy-7.1.json)
- [meshy-7](/router-schemas/meshy/meshy-7.json)
- [remesh](/router-schemas/meshy/remesh.json)
- [rigging](/router-schemas/meshy/rigging.json)
- [minimax-h3](/router-schemas/minimax/minimax-h3.json)
- [image-to-video](/router-schemas/moonvalley/image-to-video.json)
- [text-to-video](/router-schemas/moonvalley/text-to-video.json)
- [video-to-video](/router-schemas/moonvalley/video-to-video.json)
- [gpt-4.1-mini](/router-schemas/openai/gpt-4.1-mini.json)
- [gpt-4.1](/router-schemas/openai/gpt-4.1.json)
- [gpt-4o](/router-schemas/openai/gpt-4o.json)
- [gpt-5-mini](/router-schemas/openai/gpt-5-mini.json)
- [gpt-5-nano](/router-schemas/openai/gpt-5-nano.json)
- [gpt-5.5-pro](/router-schemas/openai/gpt-5.5-pro.json)
- [gpt-5.5](/router-schemas/openai/gpt-5.5.json)
- [gpt-5.6-luna](/router-schemas/openai/gpt-5.6-luna.json)
- [gpt-5.6-sol](/router-schemas/openai/gpt-5.6-sol.json)
- [gpt-5.6-terra](/router-schemas/openai/gpt-5.6-terra.json)
- [gpt-5](/router-schemas/openai/gpt-5.json)
- [gpt-6-astra](/router-schemas/openai/gpt-6-astra.json)
- [gpt-6-luna](/router-schemas/openai/gpt-6-luna.json)
- [gpt-6-sol](/router-schemas/openai/gpt-6-sol.json)
- [gpt-6.1-sol](/router-schemas/openai/gpt-6.1-sol.json)
- [gpt-6.1-terra](/router-schemas/openai/gpt-6.1-terra.json)
- [gpt-image-1.5](/router-schemas/openai/gpt-image-1.5.json)
- [gpt-image-2.5-flare](/router-schemas/openai/gpt-image-2.5-flare.json)
- [gpt-image-2.5-sunburst](/router-schemas/openai/gpt-image-2.5-sunburst.json)
- [gpt-image-2](/router-schemas/openai/gpt-image-2.json)
- [o3](/router-schemas/openai/o3.json)
- [chat-completions](/router-schemas/openrouter/chat-completions.json)
- [pika-2.5-image-to-video](/router-schemas/pika/pika-2.5-image-to-video.json)
- [pika-2.5-text-to-video](/router-schemas/pika/pika-2.5-text-to-video.json)
- [pika-gpt-image-2](/router-schemas/pika/pika-gpt-image-2.json)
- [pika-music](/router-schemas/pika/pika-music.json)
- [pika-nano-banana-2](/router-schemas/pika/pika-nano-banana-2.json)
- [pika-nano-banana-pro](/router-schemas/pika/pika-nano-banana-pro.json)
- [pika-seedance-2.0](/router-schemas/pika/pika-seedance-2.0.json)
- [pika-sfx](/router-schemas/pika/pika-sfx.json)
- [pika-soundtrack](/router-schemas/pika/pika-soundtrack.json)
- [p-video-2](/router-schemas/pruna/p-video-2.json)
- [qwen-image-3.0-pro](/router-schemas/qwen/qwen-image-3.0-pro.json)
- [qwen-image-3.0](/router-schemas/qwen/qwen-image-3.0.json)
- [recraftv2](/router-schemas/recraft/recraftv2.json)
- [recraftv3](/router-schemas/recraft/recraftv3.json)
- [recraftv4_1_pro_vector](/router-schemas/recraft/recraftv4_1_pro_vector.json)
- [recraftv4_1_pro](/router-schemas/recraft/recraftv4_1_pro.json)
- [recraftv4_1_utility_pro_vector](/router-schemas/recraft/recraftv4_1_utility_pro_vector.json)
- [recraftv4_1_utility_pro](/router-schemas/recraft/recraftv4_1_utility_pro.json)
- [recraftv4_1_utility_vector](/router-schemas/recraft/recraftv4_1_utility_vector.json)
- [recraftv4_1_utility](/router-schemas/recraft/recraftv4_1_utility.json)
- [recraftv4_1_vector](/router-schemas/recraft/recraftv4_1_vector.json)
- [recraftv4_1](/router-schemas/recraft/recraftv4_1.json)
- [recraftv4_pro](/router-schemas/recraft/recraftv4_pro.json)
- [recraftv4_styles_pro_vector](/router-schemas/recraft/recraftv4_styles_pro_vector.json)
- [recraftv4_styles_pro](/router-schemas/recraft/recraftv4_styles_pro.json)
- [recraftv4_styles_vector](/router-schemas/recraft/recraftv4_styles_vector.json)
- [recraftv4_styles](/router-schemas/recraft/recraftv4_styles.json)
- [recraftv4](/router-schemas/recraft/recraftv4.json)
- [runware-gpt-image-2.5-flare](/router-schemas/runware/runware-gpt-image-2.5-flare.json)
- [runware-gpt-image-2.5-sunburst](/router-schemas/runware/runware-gpt-image-2.5-sunburst.json)
- [runware-gpt-image-2](/router-schemas/runware/runware-gpt-image-2.json)
- [runware-nano-banana-2](/router-schemas/runware/runware-nano-banana-2.json)
- [runware-nano-banana-pro](/router-schemas/runware/runware-nano-banana-pro.json)
- [runware-seedance-2.0](/router-schemas/runware/runware-seedance-2.0.json)
- [runware-seedance-2.5](/router-schemas/runware/runware-seedance-2.5.json)
- [aleph2](/router-schemas/runway/aleph2.json)
- [gen4_image](/router-schemas/runway/gen4_image.json)
- [gen4_turbo](/router-schemas/runway/gen4_turbo.json)
- [sync-3](/router-schemas/synclabs/sync-3.json)
- [hunyuan-3d-part](/router-schemas/tencent/hunyuan-3d-part.json)
- [hunyuan-3d-smart-topology](/router-schemas/tencent/hunyuan-3d-smart-topology.json)
- [hunyuan-3d-texture-edit](/router-schemas/tencent/hunyuan-3d-texture-edit.json)
- [hunyuan-3d-uv](/router-schemas/tencent/hunyuan-3d-uv.json)
- [clean-audio-video](/router-schemas/veed/clean-audio-video.json)
- [clean-audio](/router-schemas/veed/clean-audio.json)
- [fabric-1.0](/router-schemas/veed/fabric-1.0.json)
- [lipsync-2.0](/router-schemas/veed/lipsync-2.0.json)
- [video-background-removal-fast](/router-schemas/veed/video-background-removal-fast.json)
- [video-background-removal-green-screen](/router-schemas/veed/video-background-removal-green-screen.json)
- [video-background-removal](/router-schemas/veed/video-background-removal.json)
- [veo-3.1-fast-generate-001](/router-schemas/veo/veo-3.1-fast-generate-001.json)
- [veo-3.1-generate-001](/router-schemas/veo/veo-3.1-generate-001.json)
- [veo-3.1-lite-generate-001](/router-schemas/veo/veo-3.1-lite-generate-001.json)
- [gemini-2.5-flash-image](/router-schemas/vertexai/gemini-2.5-flash-image.json)
- [gemini-3-pro-image](/router-schemas/vertexai/gemini-3-pro-image.json)
- [gemini-3.1-flash-image](/router-schemas/vertexai/gemini-3.1-flash-image.json)
- [gemini-3.1-flash-lite-image](/router-schemas/vertexai/gemini-3.1-flash-lite-image.json)
- [gemini-3.1-flash-lite](/router-schemas/vertexai/gemini-3.1-flash-lite.json)
- [gemini-3.1-pro-preview](/router-schemas/vertexai/gemini-3.1-pro-preview.json)
- [gemini-3.5-flash](/router-schemas/vertexai/gemini-3.5-flash.json)
- [gemini-3.7-flash](/router-schemas/vertexai/gemini-3.7-flash.json)
- [gemini-3.8-flash](/router-schemas/vertexai/gemini-3.8-flash.json)
- [gemini-nano-banana-2.1](/router-schemas/vertexai/gemini-nano-banana-2.1.json)
- [happyhorse-1.0-i2v](/router-schemas/wan/happyhorse-1.0-i2v.json)
- [happyhorse-1.0-r2v](/router-schemas/wan/happyhorse-1.0-r2v.json)
- [happyhorse-1.0-t2v](/router-schemas/wan/happyhorse-1.0-t2v.json)
- [happyhorse-1.0-video-edit](/router-schemas/wan/happyhorse-1.0-video-edit.json)
- [happyhorse-1.1-i2v](/router-schemas/wan/happyhorse-1.1-i2v.json)
- [happyhorse-1.1-r2v](/router-schemas/wan/happyhorse-1.1-r2v.json)
- [happyhorse-1.1-t2v](/router-schemas/wan/happyhorse-1.1-t2v.json)
- [wan2.5-i2i-preview](/router-schemas/wan/wan2.5-i2i-preview.json)
- [wan2.5-i2v-preview](/router-schemas/wan/wan2.5-i2v-preview.json)
- [wan2.5-t2i-preview](/router-schemas/wan/wan2.5-t2i-preview.json)
- [wan2.5-t2v-preview](/router-schemas/wan/wan2.5-t2v-preview.json)
- [wan2.6-i2v](/router-schemas/wan/wan2.6-i2v.json)
- [wan2.6-r2v](/router-schemas/wan/wan2.6-r2v.json)
- [wan2.6-t2v](/router-schemas/wan/wan2.6-t2v.json)
- [wan2.7-i2v](/router-schemas/wan/wan2.7-i2v.json)
- [wan2.7-r2v](/router-schemas/wan/wan2.7-r2v.json)
- [wan2.7-t2v](/router-schemas/wan/wan2.7-t2v.json)
- [wan2.7-videoedit](/router-schemas/wan/wan2.7-videoedit.json)
- [wan3.0-video-prime](/router-schemas/wan/wan3.0-video-prime.json)
- [wan3.0-video](/router-schemas/wan/wan3.0-video.json)
- [flashvsr](/router-schemas/wavespeed/flashvsr.json)
- [seedvr2](/router-schemas/wavespeed/seedvr2.json)
- [ultimate-image-upscaler](/router-schemas/wavespeed/ultimate-image-upscaler.json)
- [wavespeed-gpt-image-2.5-flare](/router-schemas/wavespeed/wavespeed-gpt-image-2.5-flare.json)
- [wavespeed-gpt-image-2.5-sunburst](/router-schemas/wavespeed/wavespeed-gpt-image-2.5-sunburst.json)
- [wavespeed-gpt-image-2](/router-schemas/wavespeed/wavespeed-gpt-image-2.json)
- [wavespeed-nano-banana-2](/router-schemas/wavespeed/wavespeed-nano-banana-2.json)
- [wavespeed-nano-banana-pro](/router-schemas/wavespeed/wavespeed-nano-banana-pro.json)
- [wavespeed-seedance-2.0](/router-schemas/wavespeed/wavespeed-seedance-2.0.json)
- [wavespeed-seedance-2.5](/router-schemas/wavespeed/wavespeed-seedance-2.5.json)
- [grok-imagine-image-2.0](/router-schemas/xai/grok-imagine-image-2.0.json)
- [grok-imagine-image-pro](/router-schemas/xai/grok-imagine-image-pro.json)
- [grok-imagine-image-quality](/router-schemas/xai/grok-imagine-image-quality.json)
- [grok-imagine-image](/router-schemas/xai/grok-imagine-image.json)
- [grok-imagine-video-1.5-lite](/router-schemas/xai/grok-imagine-video-1.5-lite.json)
- [grok-imagine-video-1.5-preview](/router-schemas/xai/grok-imagine-video-1.5-preview.json)
- [grok-imagine-video-1.5](/router-schemas/xai/grok-imagine-video-1.5.json)
- [grok-imagine-video](/router-schemas/xai/grok-imagine-video.json)

> The links below point to documentation indexes. Follow each `/_llms/` index recursively until you reach documentation pages.

## Indexes

- [English / Tutorials (297 pages)](https://docs.comfy.org/_llms/en/tutorials.txt): Documentation for English / Tutorials.
- [English / Comfy Router (248 pages)](https://docs.comfy.org/_llms/en/comfy-router.txt): Documentation for English / Comfy Router.
- [English / Built-in Nodes (1142 pages)](https://docs.comfy.org/_llms/en/built-in-nodes.txt): Documentation for English / Built-in Nodes.
- [English / Built-in Nodes / Nodes (1141 pages)](https://docs.comfy.org/_llms/en/built-in-nodes/nodes.txt): Documentation for English / Built-in Nodes / Nodes.
- [English / Built-in Nodes / Nodes / Image (125 pages)](https://docs.comfy.org/_llms/en/built-in-nodes/nodes/image.txt): Documentation for English / Built-in Nodes / Nodes / Image.
- [English / Built-in Nodes / Nodes / Model (378 pages)](https://docs.comfy.org/_llms/en/built-in-nodes/nodes/model.txt): Documentation for English / Built-in Nodes / Nodes / Model.
- [English / Built-in Nodes / Nodes / Partner (329 pages)](https://docs.comfy.org/_llms/en/built-in-nodes/nodes/partner.txt): Documentation for English / Built-in Nodes / Nodes / Partner.
- [English / Developer (177 pages)](https://docs.comfy.org/_llms/en/developer.txt): Documentation for English / Developer.
- [Chinese (1845 pages)](https://docs.comfy.org/_llms/zh.txt): Documentation for Chinese.
- [Chinese / 开始使用 (303 pages)](https://docs.comfy.org/_llms/zh/tab.txt): Documentation for Chinese / 开始使用.
- [Chinese / 内置节点 (1142 pages)](https://docs.comfy.org/_llms/zh/tab-4ef7ed40.txt): Documentation for Chinese / 内置节点.
- [Chinese / 内置节点 / 节点 (1141 pages)](https://docs.comfy.org/_llms/zh/tab-4ef7ed40/group.txt): Documentation for Chinese / 内置节点 / 节点.
- [Chinese / 内置节点 / 节点 / Model (378 pages)](https://docs.comfy.org/_llms/zh/tab-4ef7ed40/group/model.txt): Documentation for Chinese / 内置节点 / 节点 / Model.
- [Chinese / 内置节点 / 节点 / Partner (329 pages)](https://docs.comfy.org/_llms/zh/tab-4ef7ed40/group/partner.txt): Documentation for Chinese / 内置节点 / 节点 / Partner.
- [Chinese / API 开发 (294 pages)](https://docs.comfy.org/_llms/zh/api.txt): Documentation for Chinese / API 开发.
- [Japanese (1845 pages)](https://docs.comfy.org/_llms/ja.txt): Documentation for Japanese.
- [Japanese / はじめに (303 pages)](https://docs.comfy.org/_llms/ja/tab.txt): Documentation for Japanese / はじめに.
- [Japanese / 組み込みノード (1142 pages)](https://docs.comfy.org/_llms/ja/tab-e7325d8b.txt): Documentation for Japanese / 組み込みノード.
- [Japanese / 組み込みノード / ノード (1141 pages)](https://docs.comfy.org/_llms/ja/tab-e7325d8b/group.txt): Documentation for Japanese / 組み込みノード / ノード.
- [Japanese / 組み込みノード / ノード / Model (378 pages)](https://docs.comfy.org/_llms/ja/tab-e7325d8b/group/model.txt): Documentation for Japanese / 組み込みノード / ノード / Model.
- [Japanese / 組み込みノード / ノード / Partner (329 pages)](https://docs.comfy.org/_llms/ja/tab-e7325d8b/group/partner.txt): Documentation for Japanese / 組み込みノード / ノード / Partner.
- [Japanese / API 開発 (294 pages)](https://docs.comfy.org/_llms/ja/api.txt): Documentation for Japanese / API 開発.
- [Korean (1803 pages)](https://docs.comfy.org/_llms/ko.txt): Documentation for Korean.
- [Korean / 시작하기 (303 pages)](https://docs.comfy.org/_llms/ko/tab.txt): Documentation for Korean / 시작하기.
- [Korean / 내장 노드 (Built-in Nodes) (1100 pages)](https://docs.comfy.org/_llms/ko/built-in-nodes.txt): Documentation for Korean / 내장 노드 (Built-in Nodes).
- [Korean / 내장 노드 (Built-in Nodes) / 노드 (1099 pages)](https://docs.comfy.org/_llms/ko/built-in-nodes/group.txt): Documentation for Korean / 내장 노드 (Built-in Nodes) / 노드.
- [Korean / 내장 노드 (Built-in Nodes) / 노드 / Model (378 pages)](https://docs.comfy.org/_llms/ko/built-in-nodes/group/model.txt): Documentation for Korean / 내장 노드 (Built-in Nodes) / 노드 / Model.
- [Korean / 내장 노드 (Built-in Nodes) / 노드 / Partner (329 pages)](https://docs.comfy.org/_llms/ko/built-in-nodes/group/partner.txt): Documentation for Korean / 내장 노드 (Built-in Nodes) / 노드 / Partner.
- [Korean / API 개발 (294 pages)](https://docs.comfy.org/_llms/ko/api.txt): Documentation for Korean / API 개발.
- [Spanish (1849 pages)](https://docs.comfy.org/_llms/es.txt): Documentation for Spanish.
- [Spanish / Tutoriales (297 pages)](https://docs.comfy.org/_llms/es/tutoriales.txt): Documentation for Spanish / Tutoriales.
- [Spanish / Comfy Router (248 pages)](https://docs.comfy.org/_llms/es/comfy-router.txt): Documentation for Spanish / Comfy Router.
- [Spanish / Nodos integrados (1034 pages)](https://docs.comfy.org/_llms/es/nodos-integrados.txt): Documentation for Spanish / Nodos integrados.
- [Spanish / Nodos integrados / Nodos (1033 pages)](https://docs.comfy.org/_llms/es/nodos-integrados/nodos.txt): Documentation for Spanish / Nodos integrados / Nodos.
- [Spanish / Nodos integrados / Nodos / Modelo (378 pages)](https://docs.comfy.org/_llms/es/nodos-integrados/nodos/modelo.txt): Documentation for Spanish / Nodos integrados / Nodos / Modelo.
- [Spanish / Nodos integrados / Nodos / Partner (327 pages)](https://docs.comfy.org/_llms/es/nodos-integrados/nodos/partner.txt): Documentation for Spanish / Nodos integrados / Nodos / Partner.
- [Spanish / Desarrollo (213 pages)](https://docs.comfy.org/_llms/es/desarrollo.txt): Documentation for Spanish / Desarrollo.


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.