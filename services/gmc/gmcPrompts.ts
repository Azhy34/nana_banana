import { GmcProductDesign, GmcCameraMotion } from './types';

/**
 * Banned furniture and artifact constraints.
 * Enforces rigid nursery architecture and eliminates hallucinations during 3D transitions.
 */
export const GMC_VIDEO_NEGATIVE_PROMPT =
  "peeling wallpaper, wallpaper peeling off wall, unrolling paper, corner curl, wallpaper sheet bending, page curl, paper peeling, peeling corner, curling wallpaper, wallpaper tearing, paper lift, lifting corner, peeling paper, paper detachment, page turn, page flip, paper sweep, book page flip, page curl, paper page turning, opening transition, wipe transition, intro transition effect, transition wipe, fade-in, storybook page turn, morphing wallpaper pattern, drawing new elements on the wall, morphing arches, changing wallpaper motifs, animating the wallpaper design, moving wall prints, different wall color, morphing wall texture, warped walls, shifting print, repainted wall, new wall art appearing, camera shake, scene change, furniture moving, objects appearing or disappearing, text, watermark, bad quality, blurry, beam crossing the frame, ceiling beam blocking the view, wooden beam passing in front of camera, pillar or column blocking the shot, foreground object flying past the camera, obstruction entering the frame, silhouette sweeping across the frame, camera passing through objects, unexpected foreground element, parallax object crossing the shot, toy swinging, hanging toy moving, mobile spinning, mobile toy swaying, crib mobile moving, stuffed toy moving, dangling object swinging, curtains appearing, curtains materializing, new curtains, drapes appearing, new drapery, fabric appearing from nowhere, hanging decoration swinging, house bed, house-frame bed, house shaped bed frame, roof frame over bed, wooden gable frame, overhead frame beams, tall bed frame obstructing wall";

/**
 * Builds the prompt for Gemini 3.1 Flash Image to generate "Frame B" (End Frame)
 * of the exact same room with a camera position shift.
 */
export function buildEndFramePrompt(product: GmcProductDesign, motion: GmcCameraMotion = 'dolly_in'): string {
  const motionDesc = {
    dolly_in: 'moving the camera 1.5 meters closer towards the feature wall with a subtle 10-degree diagonal reframing',
    dolly_out: 'pulling the camera 1.5 meters back to reveal more of the peaceful nursery floor and wooden furnishings',
    pan_to_wall: 'panning the camera smoothly from the side window directly towards the center of the feature wall mural',
    montessori_push: 'lowering the camera to child eye-level (80cm) and gliding forward towards the floor bed and wall'
  }[motion];

  return `Camera angle reframing within the EXACT SAME children's room interior.
Reference Image 1 shows the starting scene. Reference Image 2 shows the 1:1 flat wallpaper artwork (${product.title}).

INSTRUCTION:
Generate the ending keyframe of this EXACT SAME room, ${motionDesc}.

RIGID CONTINUITY & ARCHITECTURAL LOCK:
- Every piece of furniture present in Reference 1 must remain 100% physically identical: same wood finish (natural solid birch/oak), same shape, same placement relative to the room geometry.
- Same flooring, same natural woven rug, same window daylight direction and warm golden morning sunlight.
- Zero new furniture pieces, zero disappearing objects, zero stylistic alterations.
- The wallpaper on the feature wall must be a seamless 1:1 continuation of Reference 2: ${product.description}.
- Tactile non-woven wallpaper finish (Struktur-Vinyl auf Vliesbasis) with authentic soft shadow ambient occlusion along baseboards.
- Completely devoid of plastic reflections or synthetic CGI sheen. High-end editorial architectural photography.`;
}

/**
 * Builds the motion and physics guidance prompt for Veo 3.1 / Gemini Omni 1.1
 * when interpolating between Start Frame (Frame A) and End Frame (Frame B).
 */
export function buildVideoInterpolationPrompt(product: GmcProductDesign, motion: GmcCameraMotion = 'dolly_in'): string {
  const motionVector = {
    dolly_in: 'A continuous, ultra-smooth architectural Steadicam push-in along a linear track, transitioning fluidly from the starting wide frame to the ending closer framing of the feature wall.',
    dolly_out: 'A slow, steady cinematic camera pull-back along a smooth track, transitioning fluidly from the close composition to the wider nursery interior.',
    pan_to_wall: 'An ultra-smooth architectural camera pan gliding gracefully from the side window perspective to frame the central wallpaper mural.',
    montessori_push: 'A smooth, ultra-slow low-angle forward camera glide from child eye-level towards the feature wall, framing the wooden floor bed and textured wall.'
  }[motion];

  return `${motionVector}

INTERPOLATION CONTINUITY & GEOMETRIC LOCK:
- The entire room architecture, wooden furniture, flooring, textiles, and window frame remain 100% frozen, solid, and geometrically locked.
- Absolute zero morphing, zero cross-fading, zero dissolving transitions, zero disappearing parts.
- Continuous 3D spatial coherence from the first frame to the final frame.

INANIMATE 2D INK LOCK:
- The wallpaper design (${product.title}) is flat, static 2D printed ink on textured non-woven wallpaper (Struktur-Vinyl auf Vliesbasis).
- Strictly zero biological animation, zero flapping birds, zero shifting trees, zero moving characters, and zero morphing patterns.
- Soft natural warm sunlight (${product.startingPriceEur ? 'Gemütlichkeit' : 'cozy ambient light'}) grazes across the matte paper relief with realistic physical ambient shadows.`;
}

