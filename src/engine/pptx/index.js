import PptxGenJS from 'pptxgenjs';
import { getThemeColors } from './core/themeMapper.js';
import { addHeroSlide } from './templates/hero.js';
import { addCardsSlide } from './templates/cards.js';
import { addImageLeftSlide } from './templates/imageLeft.js';
import { addStepsSlide } from './templates/steps.js';
import { addFactsSlide } from './templates/facts.js';
import { addEndingSlide } from './templates/ending.js';

export const createPresentation = async (aiData, outputPath) => {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_16x9';

  const colors = getThemeColors(aiData.theme);
  const slides = aiData.slides || [];

  for (const slideData of slides) {
    switch (slideData.type) {
      case 'HERO':
        addHeroSlide(pres, slideData, colors);
        break;
      case 'THREE_CARDS':
        addCardsSlide(pres, slideData, colors);
        break;
      case 'IMAGE_LEFT':
        await addImageLeftSlide(pres, slideData, colors);
        break;
      case 'THREE_STEPS':
        addStepsSlide(pres, slideData, colors);
        break;
      case 'FOUR_FACTS':
        addFactsSlide(pres, slideData, colors);
        break;
      case 'ENDING':
        addEndingSlide(pres, slideData, colors);
        break;
      default:
        addCardsSlide(pres, slideData, colors);
        break;
    }
  }

  await pres.writeFile({ fileName: outputPath });
  return outputPath;
};