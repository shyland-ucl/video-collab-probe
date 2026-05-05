#!/usr/bin/env node
/**
 * Day 1 fix #6: rewrite the Probe 3 suggestion bank for every pipeline
 * project so each suggestion is plain, actionable, and under ~25 words.
 * AI-fixable suggestions get a fix_template that the WoZ override buffer
 * can apply via the visual-edit panel (brightness / zoom / rotate / mute).
 */

import fs from 'node:fs';
import path from 'node:path';

const REWRITES = {
  'VID-20260429-WA0008_1__moq7gl78': [
    {
      id: 'sug_001',
      category: 'creative',
      text: "Audience heads block the bottom of the presenter in every scene. A reframe higher up would put the presenter back in clear view.",
      relatedScene: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14],
    },
    {
      id: 'sug_002',
      category: 'structural',
      text: "The camera holds one wide angle for fourteen scenes. Zooming in for a key moment would add visual variety.",
      relatedScene: [0,1,2,3,4,5,6,7,8,9,10,11,12,13],
      fix_template: { action: 'zoom', value: 130, label: 'Zoom in to 130%' },
    },
    {
      id: 'sug_003',
      category: 'issue',
      text: "A bright blank projector screen behind the presenter competes for attention. Lowering brightness softens that visual pull.",
      relatedScene: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14],
      fix_template: { action: 'brightness', value: -15, label: 'Brightness -15' },
    },
    {
      id: 'sug_004',
      category: 'issue',
      text: "A loud audience cough overlaps the presenter on scene 12. Muting the original audio removes the distraction in one tap.",
      relatedScene: 11,
      fix_template: { action: 'mute', value: true, label: 'Mute original audio' },
    },
    {
      id: 'sug_005',
      category: 'structural',
      text: "Scene 15 ends with the presenter saying thank you, a natural close. Trimming everything after this gives the video a clean ending.",
      relatedScene: 14,
    },
    {
      id: 'sug_006',
      category: 'creative',
      text: "Scenes 14 and 15 zoom in unexpectedly and break the static feel. Resetting zoom to 100% restores the steady framing.",
      relatedScene: [13, 14],
      fix_template: { action: 'zoom', value: 100, label: 'Reset zoom to 100%' },
    },
  ],
  'VID-20260429-WA0003_1__moq4eplt': [
    {
      id: 'sug_001',
      category: 'issue',
      text: "Scene 5 has visible camera shake and a slight tilt. A small clockwise rotation would straighten the horizon line.",
      relatedScene: 4,
      fix_template: { action: 'rotate', value: -3, label: 'Rotate -3 degrees' },
    },
    {
      id: 'sug_002',
      category: 'issue',
      text: "The camera tilts down to the empty stage floor mid-shot in scenes 4 and 5. Trimming those tilts keeps focus on the singer.",
      relatedScene: [3, 4],
    },
    {
      id: 'sug_003',
      category: 'structural',
      text: "All nine scenes are one continuous performance from one camera. Cutting in a closer angle on a strong line would lift the energy.",
      relatedScene: [0,1,2,3,4,5,6,7,8],
      fix_template: { action: 'zoom', value: 140, label: 'Zoom in to 140%' },
    },
    {
      id: 'sug_004',
      category: 'structural',
      text: "The audio shifts two-thirds in, from singing to a different track. Splitting at scene 6 lets you trim or rearrange the second half.",
      relatedScene: [5, 6],
    },
    {
      id: 'sug_005',
      category: 'structural',
      text: "Scene 9 is only 0.7 seconds long and adds nothing scene 8 has not shown. Removing it gives a cleaner ending.",
      relatedScene: 8,
    },
    {
      id: 'sug_006',
      category: 'creative',
      text: "Every scene sits at the same wide-to-medium distance. Zooming in on the singer for one chorus would add visual contrast.",
      relatedScene: [0,1,2,3,4,5,6,7,8],
      fix_template: { action: 'zoom', value: 150, label: 'Zoom in to 150%' },
    },
    {
      id: 'sug_007',
      category: 'creative',
      text: "The festival backdrop reads most clearly on scene 6. Pausing or holding longer here lets viewers register the event name.",
      relatedScene: 5,
    },
  ],
  'VID-20260429-WA0004_1__moq4shfx': [
    {
      id: 'sug_001',
      category: 'issue',
      text: "Audience members walk in front of the lens on scenes 1 and 4 and block the stage. Trimming around those moments helps.",
      relatedScene: [0, 3],
    },
    {
      id: 'sug_002',
      category: 'issue',
      text: "A sudden gap in the backing track on scene 8 makes the audio feel broken. Muting the original audio there hides the gap.",
      relatedScene: 7,
      fix_template: { action: 'mute', value: true, label: 'Mute original audio' },
    },
    {
      id: 'sug_003',
      category: 'structural',
      text: "Scenes 4 to 6 are continuous singing without much visual change. Splitting and shortening here keeps the pace moving.",
      relatedScene: [3, 4, 5],
    },
    {
      id: 'sug_004',
      category: 'structural',
      text: "The performance shifts from singing to spoken word at the end. Splitting at scene 7 lets you treat the spoken outro as its own beat.",
      relatedScene: [6, 7],
    },
    {
      id: 'sug_005',
      category: 'creative',
      text: "The camera angle and distance never change across the clip. Zooming in for one section would break the static feel.",
      relatedScene: [0,1,2,3,4,5,6,7],
      fix_template: { action: 'zoom', value: 130, label: 'Zoom in to 130%' },
    },
    {
      id: 'sug_006',
      category: 'creative',
      text: "On scene 3 the backup performer steps forward to the main singer. Zooming in here highlights that interaction.",
      relatedScene: 2,
      fix_template: { action: 'zoom', value: 140, label: 'Zoom in to 140%' },
    },
    {
      id: 'sug_007',
      category: 'creative',
      text: "The stage octagon prop is visually striking but always far away. A close-in zoom on it would make a strong cutaway.",
      relatedScene: [0,1,2,3,4,5,6,7],
      fix_template: { action: 'zoom', value: 160, label: 'Zoom in to 160%' },
    },
  ],
  'VID-20260430-WA0007_1__moq7e964': [
    {
      id: 'sug_001',
      category: 'issue',
      text: "The cut from bedroom to supermarket escalator feels abrupt. A short caption between scenes 2 and 3 would smooth the transition.",
      relatedScene: [1, 2],
    },
    {
      id: 'sug_002',
      category: 'issue',
      text: "The product flatlay shots on scenes 9 to 10 are noticeably darker than the rest. Lifting brightness brings them in line.",
      relatedScene: [8, 9],
      fix_template: { action: 'brightness', value: 20, label: 'Brightness +20' },
    },
    {
      id: 'sug_003',
      category: 'issue',
      text: "The pad-demo shot on scene 8 sits too low in the frame. A small zoom in keeps the hands centred.",
      relatedScene: 7,
      fix_template: { action: 'zoom', value: 120, label: 'Zoom in to 120%' },
    },
    {
      id: 'sug_004',
      category: 'structural',
      text: "The pad-application demo on scenes 7 and 8 slows the routine. Splitting and trimming here keeps the pace tight.",
      relatedScene: [6, 7],
    },
    {
      id: 'sug_005',
      category: 'structural',
      text: "The cut from supermarket aisle to bedroom on scenes 6 to 7 jumps location with no buffer. A caption transition softens the jump.",
      relatedScene: [5, 6],
    },
    {
      id: 'sug_006',
      category: 'creative',
      text: "The supermarket section is all medium tracking shots. Zooming in on a product label adds variety.",
      relatedScene: [3, 4],
      fix_template: { action: 'zoom', value: 150, label: 'Zoom in to 150%' },
    },
    {
      id: 'sug_007',
      category: 'creative',
      text: "On scene 12 the subject sits motionless on the couch. Zooming in slowly to a close-up adds visual interest.",
      relatedScene: 11,
      fix_template: { action: 'zoom', value: 130, label: 'Zoom in to 130%' },
    },
  ],
};

for (const [dir, suggestions] of Object.entries(REWRITES)) {
  const fp = path.join('footage_workspace', dir, 'project.json');
  if (!fs.existsSync(fp)) {
    console.warn('SKIP (not found):', fp);
    continue;
  }
  const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
  j.suggestions = suggestions;
  fs.writeFileSync(fp, JSON.stringify(j, null, 2));
  const fixable = suggestions.filter((s) => s.fix_template).length;
  console.log(
    'Updated', fp,
    '— ' + suggestions.length + ' suggestions, ' + fixable + ' AI-fixable (' +
    Math.round((fixable / suggestions.length) * 100) + '%)',
  );
}
