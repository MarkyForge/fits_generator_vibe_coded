export const OUTFIT_GENERATION_PROMPT = `Create a professional fashion outfit product showcase using EVERY uploaded outfit/product photo as the exact visual reference. NO MANNEQUIN, NO PERSON, NO BODY, NO MODEL. For every uploaded image, automatically remove the entire original background, isolate only the actual product, clean the edges, remove people/hands/hangers/furniture and unwanted objects, correct orientation when needed, and automatically fit and scale the product proportionally. Preserve the exact original product colors, tones, graphics, prints, logos, branding, patterns, fabric texture, stitching, seams, pockets, buttons, zippers, distressing, fading, materials, shape, cut, fit, proportions, shoe details and all small details. Never redesign, recolor, simplify, beautify, replace or invent product details. Automatically identify tops, bottoms, shoes and accessories and adapt to pants, jeans, jorts, shorts, cargo pants, trousers, sweatpants, chinos, skirts and other garments. Arrange the products into one cohesive floating outfit: upper-body clothing at the top, the correct lower-body item below it, shoes at the bottom, and uploaded accessories naturally around the outfit. Keep every product fully visible, correctly scaled, inside the frame and naturally spaced. Use a pure white #FFFFFF background with no original background, room, wall, floor, grid, furniture, scenery or gradient. Let the authentic original product colors stand out with clean lighting, realistic contrast and crisp textures without recoloring or oversaturating. Use natural fabric folds, realistic draping, authentic material texture, subtle imperfections, natural shadows, realistic lighting, accurate proportions and believable product placement. Avoid AI-looking textures, plastic surfaces, artificial smoothness, fake reflections, warped products, distorted logos, incorrect graphics, unrealistic folds and CGI appearance.

Match this exact composition and camera geometry for every product: centered horizontally in the frame, front-facing orientation, camera positioned directly in front of the product with minimal perspective distortion, product occupying a consistent proportion of the frame across all items, even consistent margins around each product, and a subtle soft contact shadow beneath it — no unnecessary background elements. Treat this composition and photography style as a template only; the uploaded product photos remain the sole source of truth for the product's actual appearance, colors, and details.

Final output: vertical 9:16, premium photorealistic fashion catalog, clean, colorful, minimal, natural and accurate.`;

export async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(OUTFIT_GENERATION_PROMPT);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}
