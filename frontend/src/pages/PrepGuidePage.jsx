import { useParams } from 'react-router-dom'
import Placeholder from '../components/Placeholder.jsx'

export default function PrepGuidePage() {
  const { id } = useParams()

  return (
    <Placeholder
      title={`Prep Guide #${id}`}
      description="Interview prep for this candidate — mock questions, resources, and company intel."
      note={`Route param :id = ${id} · full experience ships in Issue 25.`}
    />
  )
}
