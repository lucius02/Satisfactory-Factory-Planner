import './styles.css';
import { refreshAll } from './app/controller';
import { bindInfo } from './ui/info';
import { bindMap } from './ui/mapEvents';
import { bindRecipesModal } from './ui/recipesModal';
import { bindShareModal } from './ui/shareModal';
import { bindSidebar } from './ui/sidebar';

bindSidebar();
bindInfo();
bindMap();
bindRecipesModal();
bindShareModal();
requestAnimationFrame(() => refreshAll({ fit: true }));
