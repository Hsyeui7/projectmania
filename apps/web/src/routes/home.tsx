import type { Route } from './+types/home';
import { seo } from '@/lib/seo';
import { Hero } from '@/components/home/hero';
import { Discovery } from '@/components/home/discovery';
import { Story } from '@/components/home/story';
export function meta({matches,location}:Route.MetaArgs){return seo({matches,location},{title:'Project Mania — Your Ideas, Thoughtfully Made',description:'Handmade school projects, working models, college presentations and custom creations. Share your idea with Project Mania for a tailored project quotation.'});}
export default function HomePage(){return <main><Hero/><Discovery/><Story/></main>;}
