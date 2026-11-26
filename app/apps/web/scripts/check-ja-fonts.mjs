// Checks that the committed Japanese font subsets cover every character of the Japanese text.
import { checkJapaneseFonts } from './ja-fonts.mjs';

try {
  await checkJapaneseFonts();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
